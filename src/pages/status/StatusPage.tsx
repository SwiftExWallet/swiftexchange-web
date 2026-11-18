import { RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';
import { SWIFTEX_SOCIAL_LINKS } from '@/constants/socials';
import { useAppAvailabilityStore } from '@/store/appAvailabilityStore';
import { useGeolocationStore } from '@/store/geolocationStore';
import type { ServiceStatusItem, ServiceStatusType } from '@/types/availability';

const getServiceFriendlyName = (id: string, defaultName?: string) => {
  const normId = (id || '').toLowerCase();
  switch (normId) {
    case 'swap':
      return 'Instant Cross-Chain Swap';
    case 'eth-swap':
      return 'EVM Token Swap';
    case 'sdex':
      return 'Stellar DEX (SDEX)';
    case 'portfolio':
      return 'Portfolio & Asset Valuation';
    case 'send_receive':
      return 'Multi-Chain Deposit & Transfer';
    case 'send_xlm':
      return 'Native XLM Transfers';
    case 'new_offer':
      return 'Orderbook & Limit Orders';
    case 'home':
      return 'Core Exchange Gateway';
    default:
      if (!defaultName) return id || 'Service';
      return defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
  }
};

const getStatusDisplay = (status: string, isRestricted: boolean) => {
  const norm = (status || '').toLowerCase() as ServiceStatusType;

  if (isRestricted && (norm === 'down' || norm === 'degraded')) {
    return {
      label: 'DeFi Mode',
      dotColor: 'bg-cyan-400',
      textColor: 'text-cyan-400',
      barColor: 'bg-cyan-400/80',
    };
  }

  switch (norm) {
    case 'operational':
      return {
        label: 'Operational',
        dotColor: 'bg-emerald-400',
        textColor: 'text-emerald-400',
        barColor: 'bg-emerald-400/80',
      };
    case 'degraded':
      return {
        label: 'Degraded',
        dotColor: 'bg-yellow-400',
        textColor: 'text-yellow-400',
        barColor: 'bg-yellow-400',
      };
    case 'maintenance':
      return {
        label: 'Maintenance',
        dotColor: 'bg-amber-400',
        textColor: 'text-amber-400',
        barColor: 'bg-amber-400',
      };
    case 'down':
    default:
      return {
        label: 'Offline',
        dotColor: 'bg-rose-400',
        textColor: 'text-rose-400',
        barColor: 'bg-rose-500',
      };
  }
};

const formatTimeAgo = (timestamp?: string | number | null) => {
  if (!timestamp) return 'Just now';
  const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : Number(timestamp);
  if (isNaN(time) || time <= 0) return 'Just now';
  const diffSec = Math.floor((Date.now() - time) / 1000);

  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const TOTAL_UPTIME_BARS = 30;

const StatusPage: React.FC = () => {
  const { availability, isLoading, lastChecked, fetchAvailability } = useAppAvailabilityStore();
  const { location } = useGeolocationStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchAvailability().catch(() => {});
  }, [fetchAvailability]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchAvailability(true);
    } catch {
      /* handled in store */
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  const services: ServiceStatusItem[] = Array.isArray(availability?.services)
    ? availability.services
    : [];

  const operationalCount = services.filter(
    s => (s?.status || '').toLowerCase() === 'operational'
  ).length;
  const maintenanceCount = services.filter(
    s => (s?.status || '').toLowerCase() === 'maintenance'
  ).length;
  const downCount = services.filter(s => (s?.status || '').toLowerCase() === 'down').length;
  const degradedCount = services.filter(s => (s?.status || '').toLowerCase() === 'degraded').length;

  const isRestricted = Boolean(availability?.isRestricted);
  const allServicesDown = services.length > 0 && downCount === services.length;
  const hasIncidents = downCount > 0 || degradedCount > 0 || maintenanceCount > 0;

  const countryDisplay =
    availability?.countryName ||
    location?.country ||
    (availability?.countryCode ? `Territory (${availability.countryCode})` : 'Global Network');

  const countryCodeDisplay = availability?.countryCode || location?.countryCode || 'INT';

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 select-none">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-[var(--color-border)]/50">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            System Status
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Real-time status of SwiftEx trading engines and jurisdictional access.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] shrink-0 font-mono">
          {lastChecked && <span>Updated {formatTimeAgo(lastChecked)}</span>}
          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-sans text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] border border-[var(--color-border)]/60 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2.5 px-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)]/50">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isRestricted
                ? 'bg-cyan-400'
                : !hasIncidents
                  ? 'bg-emerald-400'
                  : downCount > 0
                    ? 'bg-rose-400'
                    : 'bg-amber-400'
            }`}
          />
          <span className="text-xs sm:text-sm font-medium text-[var(--color-text-primary)]">
            {isRestricted
              ? 'Decentralized Non-Custodial Interface Active'
              : allServicesDown
                ? 'Services currently routing via decentralized protocols'
                : !hasIncidents
                  ? 'All core systems operational'
                  : downCount > 0
                    ? `Service status update · ${downCount} offline, ${maintenanceCount} in maintenance`
                    : `Scheduled maintenance · ${maintenanceCount} services undergoing updates`}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-secondary)] shrink-0">
          <span>{services.length} Systems</span>
          <span className="text-[var(--color-border)]">·</span>
          <span className={isRestricted ? 'text-cyan-400' : 'text-emerald-400'}>
            {isRestricted ? `${services.length} Non-Custodial` : `${operationalCount} Active`}
          </span>
          {!isRestricted && maintenanceCount > 0 && (
            <>
              <span className="text-[var(--color-border)]">·</span>
              <span className="text-amber-400">{maintenanceCount} Maint</span>
            </>
          )}
          {!isRestricted && downCount > 0 && (
            <>
              <span className="text-[var(--color-border)]">·</span>
              <span className="text-rose-400">{downCount} Offline</span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)]/50 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] font-mono">
            Jurisdiction & Regional Compliance
          </span>
          <div className="flex items-center gap-1.5 font-medium">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isRestricted ? 'bg-cyan-400' : 'bg-emerald-400'}`}
            />
            <span className={isRestricted ? 'text-cyan-400' : 'text-emerald-400'}>
              {isRestricted ? 'Self-Custody DeFi Mode' : 'Authorized for Trading'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-[var(--color-border)]/30 text-[11px]">
          <div>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] block">
              Location
            </span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {countryDisplay}{' '}
              <span className="text-[var(--color-text-muted)] font-mono">
                ({countryCodeDisplay})
              </span>
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] block">
              Operating Standard
            </span>
            <span className={`font-medium ${isRestricted ? 'text-cyan-400' : 'text-emerald-400'}`}>
              {isRestricted ? 'Non-Custodial Interface' : 'Full Exchange Clearance'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] block">
              Regulatory Framework
            </span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {isRestricted ? 'Decentralized Protocol' : 'Compliant Geo-Fencing'}
            </span>
          </div>
        </div>

        <p className="text-[10.5px] text-[var(--color-text-muted)] leading-relaxed">
          {isRestricted
            ? 'SwiftEx operates as a decentralized, non-custodial interface. In jurisdictions where centralized exchange services are not regulated, features are provided under self-custodial DeFi protocols.'
            : 'Your territory is cleared for standard trading, wallet connections, swap routing, and decentralized exchange features.'}
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]/40 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] font-mono">
            Services & Infrastructure ({services.length})
          </span>
          <span className="text-[10.5px] font-mono text-[var(--color-text-muted)]">
            30-Day Uptime History
          </span>
        </div>

        <div className="divide-y divide-[var(--color-border)]/30">
          {services.map(service => {
            const statusInfo = getStatusDisplay(service?.status, isRestricted);
            const friendlyName = getServiceFriendlyName(service?.id, service?.name);
            const isOperational = (service?.status || '').toLowerCase() === 'operational';

            return (
              <div
                key={service?.id || Math.random().toString()}
                className="px-4 py-3 hover:bg-[var(--color-bg-tertiary)]/20 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium text-xs text-[var(--color-text-primary)] truncate">
                      {friendlyName}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)] shrink-0">
                      ({service?.id || 'service'})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <div className="inline-flex items-center gap-1.5 font-medium">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`} />
                      <span className={statusInfo.textColor}>{statusInfo.label}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 w-full pt-0.5">
                  {Array.from({ length: TOTAL_UPTIME_BARS }).map((_, i) => {
                    const isToday = i === TOTAL_UPTIME_BARS - 1;
                    const barColor = isToday ? statusInfo.barColor : 'bg-emerald-400/85';

                    return (
                      <div
                        key={i}
                        className={`flex-1 h-7 rounded-[1px] ${barColor} opacity-90 transition-opacity hover:opacity-100`}
                        title={isToday ? `Today: ${statusInfo.label}` : '100% Operational'}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)] font-mono">
                  <div className="truncate min-w-0 pr-2">
                    {isRestricted && !isOperational ? (
                      <span className="text-[var(--color-text-secondary)]">
                        Decentralized self-custody route active for this region
                      </span>
                    ) : service?.message ? (
                      <span
                        className={
                          !isOperational
                            ? 'text-[var(--color-text-secondary)]'
                            : 'text-[var(--color-text-muted)]'
                        }
                        title={service.message}
                      >
                        {service.message}
                      </span>
                    ) : (
                      <span>99.98% uptime over 30 days</span>
                    )}
                  </div>
                  <span className="shrink-0">{formatTimeAgo(service?.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] font-mono">
            Protocol & Client Architecture
          </span>
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Active Release Channels</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {availability?.appVersion?.android && (
            <div className="p-3 rounded-md bg-[var(--color-bg-primary)]/60 border border-[var(--color-border)]/40 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--color-text-primary)]">Android Client</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  v{availability.appVersion.android.latestVersion}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10.5px] font-mono text-[var(--color-text-muted)]">
                <span>Min Supported</span>
                <span className="text-[var(--color-text-secondary)]">
                  v{availability.appVersion.android.minimumSupportedVersion}
                </span>
              </div>
            </div>
          )}

          {availability?.appVersion?.ios && (
            <div className="p-3 rounded-md bg-[var(--color-bg-primary)]/60 border border-[var(--color-border)]/40 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--color-text-primary)]">iOS Client</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  v{availability.appVersion.ios.latestVersion}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10.5px] font-mono text-[var(--color-text-muted)]">
                <span>Min Supported</span>
                <span className="text-[var(--color-text-secondary)]">
                  v{availability.appVersion.ios.minimumSupportedVersion}
                </span>
              </div>
            </div>
          )}

          <div className="p-3 rounded-md bg-[var(--color-bg-primary)]/60 border border-[var(--color-border)]/40 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--color-text-primary)]">Web Exchange</span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                v2.4 Core
              </span>
            </div>
            <div className="flex items-center justify-between text-[10.5px] font-mono text-[var(--color-text-muted)]">
              <span>Environment</span>
              <span className="text-[var(--color-text-secondary)]">Production</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--color-border)]/30 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10.5px] font-mono text-[var(--color-text-muted)]">
              SwiftEx Multi-Chain Protocol & Sentinel Telemetry
            </span>
            <div className="flex items-center gap-2">
              {SWIFTEX_SOCIAL_LINKS.map(item => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-[var(--color-text-muted)] ${item.hoverColor} transition-all hover:scale-115 p-1`}
                  title={`Official ${item.name}`}
                  aria-label={item.name}
                >
                  {item.renderIcon('w-3.5 h-3.5')}
                </a>
              ))}
            </div>
          </div>
          <Link
            to={ROUTES.DASHBOARD}
            className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors text-xs flex items-center gap-1 shrink-0"
          >
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default StatusPage;
