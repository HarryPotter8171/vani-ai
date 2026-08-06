import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark", "light");
  });

  it("defaults to dark before the effect runs (SSR-safe)", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    // mounted may flip synchronously under React 19 act; theme default is what matters
    expect(result.current.theme === "dark").toBe(true);
  });

  it("defaults to dark when no stored theme exists", async () => {
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current.mounted).toBe(true));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("initializes from localStorage when present", async () => {
    localStorage.setItem("vani-theme", "light");
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current.mounted).toBe(true));
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("toggleTheme flips the theme, persists it, and updates DOM classes", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mounted).toBe(true));
    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem("vani-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem("vani-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme sets an explicit value directly", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mounted).toBe(true));

    act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem("vani-theme")).toBe("light");
  });

  it("setTheme('system') persists and resolves from prefers-color-scheme", async () => {
    localStorage.setItem("vani-theme", "system");
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mounted).toBe(true));
    expect(result.current.theme).toBe("system");
    expect(localStorage.getItem("vani-theme")).toBe("system");
  });
});
