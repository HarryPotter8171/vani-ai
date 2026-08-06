import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import path from "node:path";

import { createAuthedUser } from "../helpers/auth.js";
import { subscriptionService } from "../../billing/SubscriptionService.ts";

const { getTestApp } = await import("../helpers/testApp.js");

let app;
beforeAll(() => {
  app = getTestApp();
});

const codeExecutionEnabled = process.env.VANI_ENABLE_CODE_EXECUTION === "true";
const maybeIt = codeExecutionEnabled ? it : it.skip;

async function proUser(overrides = {}) {
  const authed = await createAuthedUser(overrides);
  await subscriptionService.changePlan(String(authed.user._id), "pro");
  return authed;
}

function client({ authHeader, ip }) {
  const withHeaders = (req) =>
    req.set("Authorization", authHeader).set("X-Forwarded-For", ip);
  return {
    get: (url) => withHeaders(request(app).get(url)),
    post: (url) => withHeaders(request(app).post(url)),
    patch: (url) => withHeaders(request(app).patch(url)),
    delete: (url) => withHeaders(request(app).delete(url)),
  };
}

async function createSession(authed) {
  const res = await client(authed).post("/api/code/sessions").send({});
  expect(res.status).toBe(201);
  return res.body.session;
}

describe("Code Interpreter: health & gating", () => {
  it("exposes /health without auth", async () => {
    const res = await request(app).get("/api/code/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty("python");
    expect(res.body).toHaveProperty("limits");
  });

  it("rejects creating sessions without auth", async () => {
    const res = await request(app).post("/api/code/sessions").send({});
    expect(res.status).toBe(401);
  });
});

describe("Code Interpreter: session + execution", () => {
  maybeIt("runs code, captures stdout/stderr, and returns completed status", async () => {
    const authed = await proUser();
    const c = client(authed);
    const session = await createSession(authed);
    const sessionId = session.sessionId;

    const exec = await c
      .post(`/api/code/sessions/${sessionId}/execute`)
      .send({
        code: [
          "import sys",
          "print('hello-stdout')",
          "print('hello-stderr', file=sys.stderr)",
          "print('2+2=', 2+2)",
        ].join("\n"),
        timeoutMs: 5000,
      });

    expect(exec.status).toBe(200);
    expect(exec.body.result.status).toBe("completed");
    expect(exec.body.result.stdout).toContain("hello-stdout");
    expect(exec.body.result.stderr).toContain("hello-stderr");
    expect(exec.body.result.stdout).toContain("2+2=");

    await c.delete(`/api/code/sessions/${sessionId}`);
  });

  maybeIt("keeps notebook variables across multiple executions in one session", async () => {
    const authed = await proUser();
    const c = client(authed);
    const session = await createSession(authed);
    const sessionId = session.sessionId;

    const exec1 = await c
      .post(`/api/code/sessions/${sessionId}/execute`)
      .send({ code: "x = 41\nprint(x)" });
    expect(exec1.status).toBe(200);
    expect(exec1.body.result.stdout).toContain("41");

    const exec2 = await c
      .post(`/api/code/sessions/${sessionId}/execute`)
      .send({ code: "print(x+1)" });
    expect(exec2.status).toBe(200);
    expect(exec2.body.result.stdout).toContain("42");

    await c.delete(`/api/code/sessions/${sessionId}`);
  });

  maybeIt("truncates large stdout according to resource limits", async () => {
    const authed = await proUser();
    const c = client(authed);
    const session = await createSession(authed);
    const sessionId = session.sessionId;

    // Keep JS-side memory small but still exceed output truncation limit.
    const code = `print("A" * 10000)`;

    const exec = await c
      .post(`/api/code/sessions/${sessionId}/execute`)
      .send({ code, timeoutMs: 5000 });

    expect(exec.status).toBe(200);
    expect(exec.body.result.status).toBe("completed");
    // Kernel truncation is applied in Node; ensure we see the truncation marker.
    expect(exec.body.result.stdout).toMatch(/\.\.\.\[truncated\]\.\.\./);

    await c.delete(`/api/code/sessions/${sessionId}`);
  });

  maybeIt(
    "interrupts an in-flight long-running execution (streaming SSE includes interrupted status)",
    async () => {
      const authed = await proUser();
      const c = client(authed);
      const session = await createSession(authed);
      const sessionId = session.sessionId;

      // Start the SSE request immediately so the kernel is truly in-flight
      // before we call the interrupt endpoint.
      const execPromise = new Promise((resolve, reject) => {
        c.post(`/api/code/sessions/${sessionId}/execute`)
          .send({
            stream: true,
            timeoutMs: 8000,
            code: [
              "import time",
              "print('starting-loop')",
              "while True:",
              "    time.sleep(0.2)",
            ].join("\n"),
          })
          .end((err, res) => {
            if (err) return reject(err);
            resolve(res);
          });
      });

      // Let the kernel start and enter the loop.
      await new Promise((r) => setTimeout(r, 500));

      const interruptRes = await c
        .post(`/api/code/sessions/${sessionId}/interrupt`)
        .send({});
      expect(interruptRes.status).toBe(200);

      const execRes = await execPromise;
      expect(execRes.status).toBe(200);
      expect(execRes.text).toContain("result_complete");
      expect(execRes.text).toMatch(/"status":"interrupted"/);

      // Ensure the session can run again after interrupt.
      const followUp = await c
        .post(`/api/code/sessions/${sessionId}/execute`)
        .send({ code: "print('after-interrupt')" });
      expect(followUp.status).toBe(200);
      expect(followUp.body.result.stdout).toContain("after-interrupt");

      await c.delete(`/api/code/sessions/${sessionId}`);
    },
    30_000
  );

  maybeIt(
    "reports timeout when code refuses to stop (node-level timeout still cancels the kernel)",
    async () => {
      const authed = await proUser();
      const c = client(authed);
      const session = await createSession(authed);
      const sessionId = session.sessionId;

      const exec = await c
        .post(`/api/code/sessions/${sessionId}/execute`)
        .send({
          // timeoutMs must be >= 1000 (PythonRunner clamps).
          timeoutMs: 1200,
          // Kernel installs SIGALRM that raises TimeoutError. We catch it and continue
          // so the kernel itself doesn't exit; node then kills it.
          code: [
            "import time",
            "while True:",
            "    try:",
            "        time.sleep(0.25)",
            "    except TimeoutError:",
            "        pass",
          ].join("\n"),
        });

      expect(exec.status).toBe(200);
      expect(exec.body.result.status).toBe("timeout");
      expect(exec.body.result.error).toMatch(/timed out/i);

      await c.delete(`/api/code/sessions/${sessionId}`);
    },
    20_000
  );
});

describe("Code Interpreter: sandbox + files", () => {
  maybeIt("blocks writing outside the sandbox workspace (restricted filesystem access)", async () => {
    const authed = await proUser();
    const c = client(authed);
    const session = await createSession(authed);
    const sessionId = session.sessionId;

    const exec = await c
      .post(`/api/code/sessions/${sessionId}/execute`)
      .send({
        code: `open("/tmp/forbidden.txt","w").write("x")`,
        timeoutMs: 5000,
      });

    expect(exec.status).toBe(200);
    expect(exec.body.result.status).toBe("failed");
    expect(String(exec.body.result.error || exec.body.result.stderr)).toMatch(
      /(outside sandbox workspace|PermissionError|forbidden)/i
    );

    await c.delete(`/api/code/sessions/${sessionId}`);
  });

  maybeIt("uploads and downloads user files (CSV, PNG, PDF)", async () => {
    const authed = await proUser();
    const c = client(authed);
    const session = await createSession(authed);
    const sessionId = session.sessionId;

    const csvText = "a,b\n1,2\n";
    const pdfBytes = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n",
      "utf8"
    );
    const pngBytes = Buffer.from(
      // Minimal 1x1 PNG (transparent)
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X7X0AAAAASUVORK5CYII=",
      "base64"
    );

    const uploadCsv = await c
      .post(`/api/code/sessions/${sessionId}/files`)
      .attach("file", Buffer.from(csvText, "utf8"), {
        filename: "input.csv",
        contentType: "text/csv",
      });
    expect(uploadCsv.status).toBe(201);

    const uploadPng = await c
      .post(`/api/code/sessions/${sessionId}/files`)
      .attach("file", pngBytes, { filename: "img.png", contentType: "image/png" });
    expect(uploadPng.status).toBe(201);

    const uploadPdf = await c
      .post(`/api/code/sessions/${sessionId}/files`)
      .attach("file", pdfBytes, { filename: "doc.pdf", contentType: "application/pdf" });
    expect(uploadPdf.status).toBe(201);

    const downloadCsv = await c
      .get(`/api/code/sessions/${sessionId}/files/${uploadCsv.body.file.id}`)
      .buffer(true);
    expect(downloadCsv.status).toBe(200);
    // supertest sometimes parses text responses as strings instead of Buffers
    // depending on content-type and Node versions.
    const csvOut =
      typeof downloadCsv.text === "string"
        ? downloadCsv.text
        : downloadCsv.body?.toString
          ? downloadCsv.body.toString("utf8")
          : "";
    expect(csvOut).toBe(csvText);

    const downloadPng = await c
      .get(`/api/code/sessions/${sessionId}/files/${uploadPng.body.file.id}`)
      .buffer(true);
    expect(downloadPng.status).toBe(200);
    expect(downloadPng.body.length).toBe(pngBytes.length);

    const downloadPdf = await c
      .get(`/api/code/sessions/${sessionId}/files/${uploadPdf.body.file.id}`)
      .buffer(true);
    expect(downloadPdf.status).toBe(200);
    expect(downloadPdf.body.length).toBe(pdfBytes.length);

    await c.delete(`/api/code/sessions/${sessionId}`);
  });

  maybeIt(
    "generates output files in OUTPUTS/ and makes them downloadable via session file listing",
    async () => {
      const authed = await proUser();
      const c = client(authed);
      const session = await createSession(authed);
      const sessionId = session.sessionId;

      const csvText = "a,b\n1,2\n3,4\n";
      const upload = await c
        .post(`/api/code/sessions/${sessionId}/files`)
        .attach("file", Buffer.from(csvText, "utf8"), {
          filename: "input.csv",
          contentType: "text/csv",
        });
      expect(upload.status).toBe(201);

      const uploaded = upload.body.file;
      const inputBaseName = path.posix.basename(uploaded.path);

      const exec = await c
        .post(`/api/code/sessions/${sessionId}/execute`)
        .send({
          timeoutMs: 5000,
          code: [
            "import csv, pathlib",
            `p = pathlib.Path(INPUTS) / "${inputBaseName}"`,
            "rows = list(csv.reader(open(p)))",
            "s = sum(int(r[1]) for r in rows[1:])",
            'with open(pathlib.Path(OUTPUTS) / "out.csv", "w") as f:',
            '    f.write("sum," + str(s))',
            "print('sum', s)",
          ].join("\n"),
        });

      expect(exec.status).toBe(200);
      expect(exec.body.result.status).toBe("completed");
      const outFile = exec.body.result.files.find((f) => f.name === "out.csv");
      expect(outFile).toBeTruthy();

      const downloadOut = await c
        .get(`/api/code/sessions/${sessionId}/files/${outFile.id}`)
        .buffer(true);
      expect(downloadOut.status).toBe(200);
      const outText =
        typeof downloadOut.text === "string"
          ? downloadOut.text
          : downloadOut.body?.toString
            ? downloadOut.body.toString("utf8")
            : "";
      expect(outText).toBe("sum,6");

      // Ensure listing includes both uploaded + generated outputs.
      const listed = await c.get(`/api/code/sessions/${sessionId}/files`);
      expect(listed.status).toBe(200);
      expect(listed.body.files.some((f) => f.id === uploaded.id)).toBe(true);
      expect(listed.body.files.some((f) => f.id === outFile.id)).toBe(true);

      await c.delete(`/api/code/sessions/${sessionId}`);
    },
    20_000
  );

  maybeIt("removes sessions and files on DELETE /sessions/:id", async () => {
    const authed = await proUser();
    const c = client(authed);
    const session = await createSession(authed);
    const sessionId = session.sessionId;

    const exec = await c
      .post(`/api/code/sessions/${sessionId}/execute`)
      .send({
        code: [
          "import pathlib",
          "open(pathlib.Path(OUTPUTS)/'x.txt','w').write('hi')",
        ].join("\n"),
        timeoutMs: 5000,
      });
    expect(exec.status).toBe(200);
    expect(exec.body.result.status).toBe("completed");

    // Grab file id from listing so we can confirm it becomes inaccessible.
    const listed = await c.get(`/api/code/sessions/${sessionId}/files`);
    expect(listed.status).toBe(200);
    const xFile = listed.body.files.find((f) => f.name === "x.txt");
    expect(xFile).toBeTruthy();

    const del = await c.delete(`/api/code/sessions/${sessionId}`);
    expect(del.status).toBe(200);

    const after = await c.get(`/api/code/sessions/${sessionId}/files/${xFile.id}`);
    expect(after.status).toBe(404);
  });
});

describe("Code Interpreter: multi-user + concurrency", () => {
  maybeIt("enforces session ownership (cross-user access is rejected)", async () => {
    const alice = await proUser();
    const bob = await proUser({ email: "bob@vani.test" });

    const aliceClient = client(alice);
    const bobClient = client(bob);

    const session = await createSession(alice);
    const sessionId = session.sessionId;

    const res = await bobClient.get(`/api/code/sessions/${sessionId}`);
    expect(res.status).toBe(404);
  });

  maybeIt(
    "can run multiple sessions concurrently for the same user",
    async () => {
      const authed = await proUser();
      const c = client(authed);

      const s1 = await createSession(authed);
      const s2 = await createSession(authed);

      const exec1 = c
        .post(`/api/code/sessions/${s1.sessionId}/execute`)
        .send({ code: "import time; time.sleep(0.3); print('s1')", timeoutMs: 5000 });
      const exec2 = c
        .post(`/api/code/sessions/${s2.sessionId}/execute`)
        .send({ code: "import time; time.sleep(0.3); print('s2')", timeoutMs: 5000 });

      const [r1, r2] = await Promise.all([exec1, exec2]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r1.body.result.stdout).toContain("s1");
      expect(r2.body.result.stdout).toContain("s2");

      await c.delete(`/api/code/sessions/${s1.sessionId}`);
      await c.delete(`/api/code/sessions/${s2.sessionId}`);
    },
    20_000
  );
});

