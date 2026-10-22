import { Mail, Send, ShieldCheck, Timer } from 'lucide-react';
import type { FC } from 'react';

export interface RecoveryStep {
  num: string;
  title: string;
  summary: string;
}

const RECOVERY_STEPS: RecoveryStep[] = [
  {
    num: '01',
    title: 'Register Guardian Email',
    summary:
      'Link your emergency recovery email hashed and stored on-chain as a recovery guardian.',
  },
  {
    num: '02',
    title: 'Initiate Recovery Request',
    summary:
      'Connect any fresh Stellar wallet to designate as the recipient of your recovered funds.',
  },
  {
    num: '03',
    title: 'On-Chain Email Verification',
    summary:
      'Send email from linked inbox. Contract cryptographically verifies DKIM without exposing keys.',
  },
  {
    num: '04',
    title: '7-Day Safety Timelock & Sweep',
    summary:
      'Security delay enforces challenge window before guarded balances sweep to new address.',
  },
];

interface RecoveryCircuitProps {
  steps?: RecoveryStep[];
  onRegisterClick?: () => void;
  compact?: boolean;
}

export const RecoveryCircuit: FC<RecoveryCircuitProps> = ({ steps = RECOVERY_STEPS }) => {
  const stepIcons = [
    <Mail key="01" className="h-3.5 w-3.5 text-cyan-400" />,
    <Send key="02" className="h-3.5 w-3.5 text-blue-400" />,
    <ShieldCheck key="03" className="h-3.5 w-3.5 text-cyan-400" />,
    <Timer key="04" className="h-3.5 w-3.5 text-purple-400" />,
  ];

  const stepSpecs = [
    { ref: 'U1 · SHA256_GUARD', net: 'NET_REG_01', badge: 'cyan' },
    { ref: 'U2 · STELLAR_INIT', net: 'NET_REQ_02', badge: 'blue' },
    { ref: 'U3 · ZK_DKIM_VRFY', net: 'NET_ZKP_03', badge: 'cyan' },
    { ref: 'U4 · TIMELOCK_SWP', net: 'NET_SWP_04', badge: 'purple' },
  ];

  const primaryPathDesktop =
    'M 0 85 H 135 L 150 100 V 230 L 175 255 V 410 L 190 425 H 320 L 336 409 V 100 L 351 85 H 505 L 520 100 V 230 L 495 255 V 410 L 510 425 H 680';

  const secondaryBusPathA =
    'M 0 91 H 131 L 144 104 V 232 L 169 257 V 413 L 187 431 H 323 L 342 412 V 103 L 354 91 H 501 L 514 104 V 228 L 489 253 V 413 L 507 431 H 680';

  const secondaryBusPathB =
    'M 0 79 H 139 L 156 96 V 228 L 181 253 V 407 L 193 419 H 317 L 330 406 V 97 L 348 79 H 509 L 526 96 V 232 L 501 257 V 407 L 513 419 H 680';

  const mobileContinuousMotionPath =
    'M 20 15 V 60 L 28 68 H 42 H 28 L 20 76 V 180 L 28 188 H 42 H 28 L 20 196 V 300 L 28 308 H 42 H 28 L 20 316 V 420 L 28 428 H 42 H 28 L 20 436 V 485';

  const pcbVias = [
    { cx: 135, cy: 85 },
    { cx: 150, cy: 100 },
    { cx: 150, cy: 230 },
    { cx: 175, cy: 255 },
    { cx: 175, cy: 410 },
    { cx: 190, cy: 425 },
    { cx: 320, cy: 425 },
    { cx: 336, cy: 409 },
    { cx: 336, cy: 310 },
    { cx: 336, cy: 205 },
    { cx: 336, cy: 100 },
    { cx: 351, cy: 85 },
    { cx: 505, cy: 85 },
    { cx: 520, cy: 100 },
    { cx: 520, cy: 230 },
    { cx: 495, cy: 255 },
    { cx: 495, cy: 410 },
    { cx: 510, cy: 425 },
  ];

  const ambientTraces = [
    'M 40 0 V 25 L 65 50 H 110',
    'M 240 0 V 35 L 265 60 H 310 L 325 75',
    'M 640 0 V 40 L 610 70 H 560',
    'M 0 260 H 45 L 70 285 V 340',
    'M 680 245 H 630 L 605 270 V 335',
    'M 210 580 V 540 L 235 515 H 295',
    'M 460 580 V 535 L 435 510 H 380',
    'M 85 215 H 125 L 138 228',
    'M 595 215 H 555 L 542 228',
  ];

  return (
    <div className="relative w-full overflow-hidden bg-transparent select-none">
      <style>{`
        @keyframes pcbLaserPulse {
          0% { stroke-dashoffset: 1100; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes icCorePulse {
          0%, 100% { opacity: 0.35; transform: scale(0.98); }
          50% { opacity: 0.9; transform: scale(1.03); }
        }
        @keyframes nodeRestrainedGlow1 {
          0%, 100% {
            border-color: rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          }
          3%, 22% {
            border-color: rgba(0, 240, 255, 0.65);
            box-shadow: 0 0 25px rgba(0, 240, 255, 0.22), inset 0 0 12px rgba(0, 240, 255, 0.08);
          }
          26% {
            border-color: rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          }
        }
        @keyframes nodeRestrainedGlow2 {
          0%, 26%, 100% {
            border-color: rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          }
          29%, 47% {
            border-color: rgba(59, 130, 246, 0.65);
            box-shadow: 0 0 25px rgba(59, 130, 246, 0.22), inset 0 0 12px rgba(59, 130, 246, 0.08);
          }
          51% {
            border-color: rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          }
        }
        @keyframes nodeRestrainedGlow3 {
          0%, 51%, 100% {
            border-color: rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          }
          54%, 72% {
            border-color: rgba(0, 240, 255, 0.65);
            box-shadow: 0 0 25px rgba(0, 240, 255, 0.22), inset 0 0 12px rgba(0, 240, 255, 0.08);
          }
          76% {
            border-color: rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          }
        }
        @keyframes nodeRestrainedGlow4 {
          0%, 76%, 100% {
            border-color: rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          }
          79%, 97% {
            border-color: rgba(168, 85, 247, 0.65);
            box-shadow: 0 0 25px rgba(168, 85, 247, 0.22), inset 0 0 12px rgba(168, 85, 247, 0.08);
          }
        }
        .hero-circuit-card-1 { animation: nodeRestrainedGlow1 8s infinite ease-in-out; }
        .hero-circuit-card-2 { animation: nodeRestrainedGlow2 8s infinite ease-in-out; }
        .hero-circuit-card-3 { animation: nodeRestrainedGlow3 8s infinite ease-in-out; }
        .hero-circuit-card-4 { animation: nodeRestrainedGlow4 8s infinite ease-in-out; }
        .hero-primary-stream {
          stroke-dasharray: 160 940;
          animation: pcbLaserPulse 8s linear infinite;
        }
        .hero-secondary-stream {
          stroke-dasharray: 90 1010;
          animation: pcbLaserPulse 8s linear infinite;
          animation-delay: -0.35s;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-circuit-card-1, .hero-circuit-card-2, .hero-circuit-card-3, .hero-circuit-card-4, .hero-primary-stream, .hero-secondary-stream {
            animation: none !important;
          }
          animateMotion {
            dur: 0s !important;
            repeatCount: 0 !important;
          }
        }
      `}</style>

      <div className="hidden lg:block relative h-[580px] w-full max-w-[680px] mx-auto bg-transparent">
        <svg
          viewBox="0 0 680 580"
          className="absolute inset-0 h-full w-full pointer-events-none select-none"
        >
          <defs>
            <pattern id="pcb-sub-grid" width="12" height="12" patternUnits="userSpaceOnUse">
              <path
                d="M 12 0 H 0 V 12"
                fill="none"
                stroke="rgba(0, 240, 255, 0.025)"
                strokeWidth="0.5"
              />
            </pattern>
            <pattern id="pcb-main-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <rect width="48" height="48" fill="url(#pcb-sub-grid)" />
              <path
                d="M 48 0 H 0 V 48"
                fill="none"
                stroke="rgba(56, 189, 248, 0.06)"
                strokeWidth="0.75"
              />
              <circle cx="24" cy="24" r="0.7" fill="rgba(0, 240, 255, 0.14)" />
            </pattern>

            <pattern
              id="pcb-ground-hatch"
              width="8"
              height="8"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0, 240, 255, 0.04)" strokeWidth="1" />
            </pattern>

            <radialGradient id="pcb-blueprint-fade" cx="50%" cy="48%" r="54%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>

            <mask id="pcb-blueprint-mask">
              <rect width="680" height="580" fill="url(#pcb-blueprint-fade)" />
            </mask>

            <linearGradient id="gold-pad-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="50%" stopColor="#EAB308" />
              <stop offset="100%" stopColor="#CA8A04" />
            </linearGradient>

            <linearGradient id="ic-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E293B" />
              <stop offset="50%" stopColor="#0F172A" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>

            <filter id="soft-neon-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            width="680"
            height="580"
            fill="url(#pcb-main-grid)"
            mask="url(#pcb-blueprint-mask)"
          />

          <rect
            x="24"
            y="220"
            width="95"
            height="110"
            rx="4"
            fill="url(#pcb-ground-hatch)"
            stroke="rgba(0, 240, 255, 0.08)"
            strokeWidth="0.6"
          />
          <rect
            x="560"
            y="220"
            width="95"
            height="110"
            rx="4"
            fill="url(#pcb-ground-hatch)"
            stroke="rgba(0, 240, 255, 0.08)"
            strokeWidth="0.6"
          />

          {[
            { cx: 22, cy: 22 },
            { cx: 658, cy: 22 },
            { cx: 22, cy: 558 },
            { cx: 658, cy: 558 },
          ].map((mount, i) => (
            <g key={i} opacity="0.55">
              <circle
                cx={mount.cx}
                cy={mount.cy}
                r="8"
                fill="none"
                stroke="rgba(148, 163, 184, 0.3)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={mount.cx}
                cy={mount.cy}
                r="5.5"
                fill="var(--color-bg-primary)"
                stroke="url(#gold-pad-grad)"
                strokeWidth="1.5"
              />
              <circle cx={mount.cx} cy={mount.cy} r="3" fill="var(--color-bg-primary)" />
            </g>
          ))}

          {ambientTraces.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="rgba(56, 189, 248, 0.08)"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          <path
            d={secondaryBusPathA}
            fill="none"
            stroke="rgba(56, 189, 248, 0.14)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={secondaryBusPathB}
            fill="none"
            stroke="rgba(56, 189, 248, 0.14)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={secondaryBusPathA}
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hero-secondary-stream"
            opacity="0.45"
          />

          <path
            d={primaryPathDesktop}
            fill="none"
            stroke="rgba(15, 23, 42, 0.9)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={primaryPathDesktop}
            fill="none"
            stroke="rgba(56, 189, 248, 0.25)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={primaryPathDesktop}
            fill="none"
            stroke="#00F0FF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hero-primary-stream"
            filter="url(#soft-neon-glow)"
          />
          <path
            d={primaryPathDesktop}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hero-primary-stream"
            opacity="0.9"
          />

          <g transform="translate(296, 218)">
            {[10, 20, 30, 40, 50, 60, 70].map(x => (
              <g key={`v-pin-${x}`}>
                <rect x={x - 1.5} y="-6" width="3" height="7" rx="0.5" fill="#94A3B8" />
                <rect x={x - 1} y="-4" width="2" height="3" fill="#E2E8F0" />
                <rect x={x - 1.5} y="75" width="3" height="7" rx="0.5" fill="#94A3B8" />
                <rect x={x - 1} y="77" width="2" height="3" fill="#E2E8F0" />
              </g>
            ))}
            {[12, 22, 32, 44, 54, 64].map(y => (
              <g key={`h-pin-${y}`}>
                <rect x="-6" y={y - 1.5} width="7" height="3" rx="0.5" fill="#94A3B8" />
                <rect x="-4" y={y - 1} width="3" height="2" fill="#E2E8F0" />
                <rect x="79" y={y - 1.5} width="7" height="3" rx="0.5" fill="#94A3B8" />
                <rect x="81" y={y - 1} width="3" height="2" fill="#E2E8F0" />
              </g>
            ))}

            <rect
              x="0"
              y="0"
              width="80"
              height="76"
              rx="5"
              fill="url(#ic-body-grad)"
              stroke="rgba(0, 240, 255, 0.45)"
              strokeWidth="1.2"
            />
            <rect
              x="6"
              y="6"
              width="68"
              height="64"
              rx="3"
              fill="none"
              stroke="rgba(255, 255, 255, 0.07)"
              strokeWidth="0.75"
            />
            <circle cx="12" cy="12" r="2" fill="#00F0FF" opacity="0.8" />

            <circle
              cx="40"
              cy="32"
              r="14"
              fill="rgba(0, 240, 255, 0.12)"
              style={{ animation: 'icCorePulse 3s infinite ease-in-out' }}
            />
            <rect
              x="31"
              y="23"
              width="18"
              height="18"
              rx="3"
              fill="#061224"
              stroke="#00F0FF"
              strokeWidth="1"
            />
            <circle cx="40" cy="32" r="3.5" fill="#00F0FF" filter="url(#soft-neon-glow)" />

            <text
              x="40"
              y="53"
              textAnchor="middle"
              fill="#E2E8F0"
              fontSize="6.5"
              fontFamily="monospace"
              fontWeight="bold"
              letterSpacing="0.08em"
            >
              ZK-DKIM-V2
            </text>
            <text
              x="40"
              y="62"
              textAnchor="middle"
              fill="#38BDF8"
              fontSize="5"
              fontFamily="monospace"
              letterSpacing="0.06em"
            >
              SOROBAN_CORE
            </text>
          </g>

          {[
            { x: 4, y: 81, w: 8, h: 8 },
            { x: 146, y: 158, w: 8, h: 6 },
            { x: 171, y: 366, w: 8, h: 6 },
            { x: 291, y: 421, w: 8, h: 8 },
            { x: 381, y: 81, w: 8, h: 8 },
            { x: 516, y: 158, w: 8, h: 6 },
            { x: 491, y: 366, w: 8, h: 6 },
            { x: 668, y: 421, w: 8, h: 8 },
          ].map((pad, idx) => (
            <g key={idx}>
              <rect
                x={pad.x}
                y={pad.y}
                width={pad.w}
                height={pad.h}
                rx="1.5"
                fill="#0F172A"
                stroke="url(#gold-pad-grad)"
                strokeWidth="1.2"
              />
              <rect
                x={pad.x + 2}
                y={pad.y + 2}
                width={pad.w - 4}
                height={pad.h - 4}
                rx="0.5"
                fill="#00F0FF"
                opacity="0.75"
              />
            </g>
          ))}

          {pcbVias.map((pt, idx) => (
            <g key={idx}>
              <circle
                cx={pt.cx}
                cy={pt.cy}
                r="5.2"
                fill="var(--color-bg-primary)"
                stroke="rgba(0, 240, 255, 0.25)"
                strokeWidth="0.7"
              />
              <circle cx={pt.cx} cy={pt.cy} r="3.4" fill="url(#gold-pad-grad)" />
              <circle cx={pt.cx} cy={pt.cy} r="1.6" fill="var(--color-bg-primary)" />
              <circle cx={pt.cx} cy={pt.cy} r="0.9" fill="#00F0FF" />
            </g>
          ))}

          <g fill="rgba(148, 163, 184, 0.45)" fontFamily="monospace" fontSize="6.5">
            <text x="14" y="74">
              J1: GUARDIAN_IN
            </text>
            <text x="158" y="218">
              BUS_A · 32B_SHA256
            </text>
            <text x="346" y="195">
              CLK_100MHZ
            </text>
            <text x="346" y="332">
              ZK_PROOF_BUS
            </text>
            <text x="530" y="218">
              TIMELOCK_EN
            </text>
            <text x="612" y="414">
              J2: SWEEP_OUT
            </text>
            <text x="32" y="344">
              GND_ZONE_L
            </text>
            <text x="568" y="344">
              GND_ZONE_R
            </text>
            <text x="275" y="566" fill="rgba(0, 240, 255, 0.35)">
              REV 4.2 · SOROBAN-RECOVERY-PCB
            </text>
          </g>

          <circle r="4" fill="#00F0FF" filter="url(#soft-neon-glow)">
            <animateMotion
              path={primaryPathDesktop}
              dur="8s"
              repeatCount="indefinite"
              rotate="auto"
            />
          </circle>

          <circle r="1.8" fill="#FFFFFF">
            <animateMotion
              path={primaryPathDesktop}
              dur="8s"
              repeatCount="indefinite"
              rotate="auto"
            />
          </circle>

          <circle r="3" fill="#3B82F6" opacity="0.85" filter="url(#soft-neon-glow)">
            <animateMotion
              path={primaryPathDesktop}
              dur="8s"
              begin="0.14s"
              repeatCount="indefinite"
              rotate="auto"
            />
          </circle>

          <circle r="2.4" fill="#A855F7" opacity="0.8" filter="url(#soft-neon-glow)">
            <animateMotion
              path={primaryPathDesktop}
              dur="8s"
              begin="0.28s"
              repeatCount="indefinite"
              rotate="auto"
            />
          </circle>
        </svg>

        {[
          {
            pos: 'left-[10px] top-[30px]',
            cardClass: 'hero-circuit-card-1',
            badgeClass: 'border-cyan-500/30 bg-cyan-950/70 text-cyan-400',
            ledColor: 'bg-cyan-400 shadow-[0_0_8px_#00F0FF]',
          },
          {
            pos: 'left-[10px] top-[370px]',
            cardClass: 'hero-circuit-card-2',
            badgeClass: 'border-blue-500/30 bg-blue-950/70 text-blue-400',
            ledColor: 'bg-blue-400 shadow-[0_0_8px_#3B82F6]',
          },
          {
            pos: 'left-[385px] top-[30px]',
            cardClass: 'hero-circuit-card-3',
            badgeClass: 'border-cyan-500/30 bg-cyan-950/70 text-cyan-400',
            ledColor: 'bg-cyan-400 shadow-[0_0_8px_#00F0FF]',
          },
          {
            pos: 'left-[385px] top-[370px]',
            cardClass: 'hero-circuit-card-4',
            badgeClass: 'border-purple-500/30 bg-purple-950/70 text-purple-400',
            ledColor: 'bg-purple-400 shadow-[0_0_8px_#A855F7]',
          },
        ].map((cfg, idx) => (
          <div
            key={idx}
            className={`${cfg.cardClass} absolute ${cfg.pos} w-[285px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-4 backdrop-blur-md shadow-lg transition-all`}
          >
            <div className="pointer-events-none absolute -top-[5px] left-6 flex gap-1.5">
              {[0, 1, 2, 3].map(p => (
                <span
                  key={p}
                  className="h-[4px] w-[6px] rounded-t-[1px] bg-gradient-to-b from-slate-200 to-slate-500 opacity-75"
                />
              ))}
            </div>
            <div className="pointer-events-none absolute -bottom-[5px] right-6 flex gap-1.5">
              {[0, 1, 2, 3].map(p => (
                <span
                  key={p}
                  className="h-[4px] w-[6px] rounded-b-[1px] bg-gradient-to-t from-slate-200 to-slate-500 opacity-75"
                />
              ))}
            </div>

            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${cfg?.badgeClass || ''}`}
                >
                  {steps?.[idx]?.num || `0${idx + 1}`}
                </span>
                <span className="font-mono text-[9px] tracking-widest text-slate-500">
                  {stepSpecs?.[idx]?.ref || ''}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${cfg?.ledColor || ''}`} />
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                  {stepIcons?.[idx] || null}
                </div>
              </div>
            </div>

            <h3 className="font-['Space_Grotesk'] text-sm font-semibold text-white leading-tight">
              {steps?.[idx]?.title || ''}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              {steps?.[idx]?.summary || ''}
            </p>

            <div className="mt-2.5 flex items-center justify-between pt-1.5 border-t border-white/[0.04] font-mono text-[9px] text-slate-500">
              <span>BUS: {stepSpecs?.[idx]?.net || ''}</span>
              <span className="text-cyan-400/70">STATUS: SYNC</span>
            </div>
          </div>
        ))}
      </div>

      <div className="lg:hidden relative flex py-4 px-2 bg-transparent">
        <div className="relative w-11 shrink-0">
          <svg
            viewBox="0 0 44 500"
            className="absolute inset-0 h-full w-full pointer-events-none select-none"
          >
            <defs>
              <filter id="soft-mobile-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              d="M 14 15 V 485"
              fill="none"
              stroke="rgba(56, 189, 248, 0.12)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            <path
              d="M 20 15 V 60 L 28 68 H 42 M 20 60 V 180 L 28 188 H 42 M 20 180 V 300 L 28 308 H 42 M 20 300 V 420 L 28 428 H 42 M 20 420 V 485"
              fill="none"
              stroke="rgba(56, 189, 248, 0.25)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {[68, 188, 308, 428].map((y, idx) => (
              <g key={idx}>
                <circle
                  cx="20"
                  cy={y - 8}
                  r="4"
                  fill="var(--color-bg-primary)"
                  stroke="#EAB308"
                  strokeWidth="1.2"
                />
                <circle cx="20" cy={y - 8} r="1.4" fill="#00F0FF" />
                <rect
                  x="37"
                  y={y - 3}
                  width="6"
                  height="6"
                  rx="1"
                  fill="#0F172A"
                  stroke="#EAB308"
                  strokeWidth="1"
                />
              </g>
            ))}

            <circle r="3.2" fill="#00F0FF" filter="url(#soft-mobile-glow)">
              <animateMotion path={mobileContinuousMotionPath} dur="6s" repeatCount="indefinite" />
            </circle>

            <circle r="1.5" fill="#FFFFFF">
              <animateMotion path={mobileContinuousMotionPath} dur="6s" repeatCount="indefinite" />
            </circle>

            <circle r="2.4" fill="#3B82F6" opacity="0.85" filter="url(#soft-mobile-glow)">
              <animateMotion
                path={mobileContinuousMotionPath}
                dur="6s"
                begin="0.2s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        </div>

        <div className="flex-1 space-y-3 pr-1">
          {steps.map((step, idx) => (
            <div
              key={step.num}
              className={`hero-circuit-card-${idx + 1} relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-3.5 backdrop-blur-md shadow-md`}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-1.5 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-cyan-500/30 bg-cyan-950/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-400">
                    {step.num}
                  </span>
                  <span className="font-mono text-[9px] tracking-wider text-slate-500">
                    {stepSpecs[idx]?.ref}
                  </span>
                </div>
                <div className="flex h-5 w-5 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                  {stepIcons[idx]}
                </div>
              </div>
              <h3 className="font-['Space_Grotesk'] text-xs font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400 line-clamp-2">
                {step.summary}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
