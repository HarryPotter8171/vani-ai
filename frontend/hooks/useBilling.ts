'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelSubscription,
  fetchBillingOverview,
  openCustomerPortal,
  requestPlanChange,
  resumeSubscription,
  type BillingInterval,
  type BillingOverview,
  type PlanChangeResult,
  type PlanId,
} from '@/lib/billing';
import { getUserFriendlyError, toUserFacingError } from '@/lib/userFacingError';

export interface UseBillingOptions {
  enabled?: boolean;
  onError?: (message: string) => void;
}

export function useBilling({ enabled = true, onError }: UseBillingOptions = {}) {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const refresh = useCallback(async () => {
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchBillingOverview();
        if (cancelled) return;
        setOverview(next);
        if (next.subscription.billingInterval) {
          setBillingInterval(next.subscription.billingInterval);
        }
      } catch (err) {
        if (cancelled) return;
        const message = toUserFacingError(err, "Couldn't load billing");
        console.error('[billing]', err);
        setError(message);
        onErrorRef.current?.(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  const changePlan = useCallback(
    async (
      planId: PlanId,
      nextInterval: BillingInterval = billingInterval,
      provider?: 'stripe' | 'razorpay' | null
    ) => {
      setUpgrading(true);
      setError(null);
      try {
        const result: PlanChangeResult = await requestPlanChange(
          planId,
          nextInterval,
          provider
        );
        if (result.checkoutUrl || result.checkout?.url) {
          const url = result.checkoutUrl || result.checkout?.url;
          if (url) {
            window.location.href = url;
            return result;
          }
        }
        if (result.overview) setOverview(result.overview);
        else setReloadToken((t) => t + 1);
        return result;
      } catch (err) {
        const message = getUserFriendlyError(err, {
          feature: 'billing',
          fallback: 'Plan change failed',
        });
        setError(message);
        onErrorRef.current?.(message);
        return null;
      } finally {
        setUpgrading(false);
      }
    },
    [billingInterval]
  );

  const upgrade = changePlan;

  const openPortal = useCallback(async () => {
    setUpgrading(true);
    try {
      const { portalUrl } = await openCustomerPortal();
      if (portalUrl) window.location.href = portalUrl;
      return portalUrl;
    } catch (err) {
      const message = toUserFacingError(err, "Couldn't open the billing portal");
      console.error('[billing]', err);
      setError(message);
      onErrorRef.current?.(message);
      return null;
    } finally {
      setUpgrading(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    setUpgrading(true);
    try {
      const result = await cancelSubscription();
      setReloadToken((t) => t + 1);
      return result;
    } catch (err) {
      const message = toUserFacingError(err, "Couldn't cancel subscription");
      console.error('[billing]', err);
      setError(message);
      onErrorRef.current?.(message);
      return null;
    } finally {
      setUpgrading(false);
    }
  }, []);

  const resume = useCallback(async () => {
    setUpgrading(true);
    try {
      const result = await resumeSubscription();
      setReloadToken((t) => t + 1);
      return result;
    } catch (err) {
      const message = toUserFacingError(err, "Couldn't resume subscription");
      console.error('[billing]', err);
      setError(message);
      onErrorRef.current?.(message);
      return null;
    } finally {
      setUpgrading(false);
    }
  }, []);

  return {
    overview,
    loading,
    upgrading,
    error,
    billingInterval,
    setBillingInterval,
    refresh,
    changePlan,
    upgrade,
    openPortal,
    cancel,
    resume,
  };
}
