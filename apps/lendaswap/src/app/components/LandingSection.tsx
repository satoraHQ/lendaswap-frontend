import {
  ArrowDown,
  ArrowLeftRight,
  Clipboard,
  ClipboardCheck,
  Key,
  Shield,
} from "lucide-react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#/components/ui/accordion";
import { ReactComponent as BitcoinIcon } from "../../assets/bitcoin.svg";

export function LandingSection() {
  const [copiedTerminal, setCopiedTerminal] = useState(false);

  return (
    <>
      {/* Stats & Features - Only show on home page */}
      <div className="mx-auto max-w-6xl mt-[240px] space-y-5 px-4">
        {/* Social Proof */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex items-center -space-x-4">
            {[
              "https://api.dicebear.com/7.x/lorelei/svg?seed=Felix&backgroundColor=a3c410",
              "https://api.dicebear.com/7.x/lorelei/svg?seed=Mia&backgroundColor=a3c410",
              "https://api.dicebear.com/7.x/lorelei/svg?seed=Oscar&backgroundColor=a3c410",
              "https://api.dicebear.com/7.x/lorelei/svg?seed=Luna&backgroundColor=a3c410",
            ].map((src) => (
              <div
                key={src}
                className="relative transition-all duration-300 hover:z-10 hover:scale-110"
              >
                <img
                  src={src}
                  alt="User avatar"
                  className="w-10 h-10 md:w-11 md:h-11 rounded-full border-2 border-background shadow-lg bg-lime-400/20"
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col items-start">
            <span className="text-lime-400 text-xl md:text-2xl">★★★★★</span>
            <p className="text-sm text-muted-foreground font-medium">
              Trusted by{" "}
              <span className="text-foreground font-bold">4,102+</span>{" "}
              Bitcoiners
            </p>
          </div>
        </div>

        {/* Top Row - Bento Grid: Square left, Wide right */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          {/* Self-Custody - 100% Secured */}
          <div className="md:col-span-2 group relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-lime-400/5 p-4 md:p-6 shadow-sm transition-all duration-300 hover:border-lime-400/30 hover:shadow-xl hover:shadow-lime-400/5 aspect-square md:aspect-square">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-400/0 via-transparent to-lime-400/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            {/* Background circles - Apple-style behind shield, animate on hover */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[240px] h-[240px] md:w-[320px] md:h-[320px] rounded-full bg-gradient-to-br from-lime-300/[0.08] to-lime-500/[0.03] blur-sm opacity-0 scale-50 transition-all duration-700 ease-out group-hover:opacity-100 group-hover:scale-100" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[180px] h-[180px] md:w-[240px] md:h-[240px] rounded-full border border-lime-400/[0.1] opacity-0 scale-50 transition-all duration-500 delay-100 ease-out group-hover:opacity-100 group-hover:scale-100" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[120px] h-[120px] md:w-[160px] md:h-[160px] rounded-full border border-lime-400/[0.15] opacity-0 scale-50 transition-all duration-500 delay-200 ease-out group-hover:opacity-100 group-hover:scale-100" />

            <style>{`
                    .shield-container {
                      transition: transform 0.5s ease-out, filter 0.5s ease-out;
                    }
                    .group:hover .shield-container {
                      transform: scale(1.05);
                      filter: drop-shadow(0 0 25px rgba(163, 196, 16, 0.4));
                    }
                    .shield-check {
                      stroke-dasharray: 100;
                      stroke-dashoffset: 100;
                      transition: stroke-dashoffset 0.5s ease-out 0.15s;
                    }
                    .group:hover .shield-check {
                      stroke-dashoffset: 0;
                    }
                    .shield-fill {
                      transition: all 0.4s ease-out;
                    }
                    .group:hover .shield-fill {
                      filter: brightness(1.1);
                    }
                  `}</style>

            {/* Animated Shield with Checkmark */}
            <div className="flex-1 flex items-center justify-center h-full pb-6 md:pb-8">
              <div className="shield-container">
                <svg
                  viewBox="0 0 80 90"
                  className="w-24 h-[108px] md:w-32 md:h-[144px]"
                  aria-hidden="true"
                >
                  {/* Shield fill with gradient */}
                  <path
                    className="shield-fill"
                    d="M40 5 L70 20 L70 45 C70 65 55 80 40 85 C25 80 10 65 10 45 L10 20 Z"
                    fill="url(#shieldGradient2)"
                  />
                  {/* Checkmark that draws on hover */}
                  <path
                    className="shield-check"
                    d="M26 45 L36 55 L54 37"
                    fill="none"
                    stroke="white"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient
                      id="shieldGradient2"
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor="#c2e821" />
                      <stop offset="100%" stopColor="#a3c410" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 right-4 md:right-6">
              <div className="text-base md:text-xl font-bold tracking-tight text-foreground">
                100% Secured
              </div>
              <div className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-0.5">
                Your keys. Your money. Always.
              </div>
            </div>
          </div>

          {/* Mobile App Promo - Wide */}
          <div className="md:col-span-3 group relative rounded-3xl border border-border bg-gradient-to-br from-card via-card to-lime-400/5 p-4 md:p-6 shadow-sm transition-all duration-300 hover:border-lime-400/30 hover:shadow-xl hover:shadow-lime-400/5 aspect-square md:aspect-auto overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-400/0 via-transparent to-lime-400/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100 rounded-3xl" />

            {/* Coming Soon - Big background text */}
            <div className="absolute top-[35%] right-4 sm:right-8 md:right-12 -translate-y-1/2 flex flex-col items-end pointer-events-none">
              <span className="text-4xl sm:text-5xl md:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tighter text-lime-400/[0.08] leading-none transition-all duration-500 group-hover:text-lime-400/[0.15]">
                COMING
              </span>
              <span className="text-4xl sm:text-5xl md:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tighter text-lime-400/[0.12] leading-none transition-all duration-500 group-hover:text-lime-400/[0.2]">
                SOON
              </span>
            </div>

            {/* Phone - floating, fades out at bottom */}
            <div className="absolute top-[50%] left-10 sm:left-14 md:left-20 -translate-y-1/2">
              <div
                className="relative transition-transform duration-500 ease-out group-hover:-translate-y-2"
                style={{
                  perspective: "1000px",
                  maskImage:
                    "linear-gradient(to bottom, black 40%, transparent 90%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, black 40%, transparent 90%)",
                }}
              >
                {/* Phone Frame */}
                <div className="relative w-[100px] sm:w-[110px] md:w-[110px] lg:w-[130px] aspect-[1/2] rounded-[20px] sm:rounded-[22px] md:rounded-[24px] bg-gradient-to-b from-zinc-700 to-zinc-900 dark:from-zinc-600 dark:to-zinc-800 p-[3px] sm:p-[3px] md:p-[4px]">
                  {/* Inner bezel */}
                  <div className="relative w-full h-full rounded-[17px] sm:rounded-[19px] md:rounded-[20px] bg-black overflow-hidden">
                    {/* Dynamic Island */}
                    <div className="absolute top-2.5 sm:top-3 md:top-3 left-1/2 -translate-x-1/2 w-[30px] sm:w-[32px] md:w-[34px] h-[8px] sm:h-[9px] md:h-[10px] bg-black rounded-full z-10" />
                    {/* Screen */}
                    <div className="w-full h-full bg-gradient-to-br from-lime-100 via-lime-50 to-white dark:from-lime-400/20 dark:via-lime-500/10 dark:to-lime-400/5" />
                    {/* Screen reflection */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
                  </div>
                  {/* Side buttons */}
                  <div className="absolute -right-[2px] top-[35%] w-[2px] sm:w-[3px] h-[18%] bg-zinc-600 dark:bg-zinc-500 rounded-r-sm" />
                  <div className="absolute -left-[2px] top-[28%] w-[2px] sm:w-[3px] h-[12%] bg-zinc-600 dark:bg-zinc-500 rounded-l-sm" />
                  <div className="absolute -left-[2px] top-[42%] w-[2px] sm:w-[3px] h-[18%] bg-zinc-600 dark:bg-zinc-500 rounded-l-sm" />
                </div>
              </div>
            </div>

            {/* Text - positioned at bottom */}
            <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 right-4 md:right-6">
              <div className="text-base md:text-xl font-bold tracking-tight text-foreground">
                Get the App
              </div>
              <a
                href="https://lendasat.com/app_waitlist"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1.5 text-xs md:text-sm font-medium text-lime-400 hover:text-lime-300 transition-colors"
              >
                Join waitlist
                <ArrowDown className="h-3 w-3 rotate-[-90deg]" />
              </a>
            </div>
          </div>
        </div>

        {/* Middle Row - Bento Grid: Wide left, Square right */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          {/* Developer Docs - Wide */}
          <div className="md:col-span-3 group relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-lime-400/5 p-4 md:p-6 shadow-sm transition-all duration-300 hover:border-lime-400/30 hover:shadow-xl hover:shadow-lime-400/5 aspect-[4/3] md:aspect-auto">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-400/0 via-transparent to-lime-400/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <style>{`
                    @keyframes typewriter {
                      from { max-width: 0; }
                      to { max-width: 100%; }
                    }
                    @keyframes blink {
                      0%, 50% { opacity: 1; }
                      51%, 100% { opacity: 0; }
                    }
                    .docs-terminal-line {
                      max-width: 100%;
                      overflow: hidden;
                      white-space: nowrap;
                    }
                    .group:hover .docs-terminal-line-1 { animation: typewriter 0.2s steps(25) forwards; max-width: 0; }
                    .group:hover .docs-terminal-line-2 { animation: typewriter 0.3s steps(35) 0.2s forwards; max-width: 0; }
                    .group:hover .docs-terminal-line-3 { animation: typewriter 0.25s steps(30) 0.5s forwards; max-width: 0; }
                    .group:hover .docs-terminal-line-4 { animation: typewriter 0.35s steps(40) 0.75s forwards; max-width: 0; }
                    .group:hover .docs-terminal-line-5 { animation: typewriter 0.3s steps(35) 1.1s forwards; max-width: 0; }
                    .group:hover .docs-terminal-line-6 { animation: typewriter 0.35s steps(40) 1.4s forwards; max-width: 0; }
                    .group:hover .docs-terminal-cursor {
                      animation: blink 0.8s steps(1) infinite;
                    }
                  `}</style>
            <div className="relative h-full flex flex-col justify-between">
              {/* Terminal Mockup - Centered and narrower */}
              <div className="flex-1 flex items-center justify-center">
                <div className="w-[95%] rounded-2xl bg-zinc-100 dark:bg-zinc-950/95 border border-zinc-300 dark:border-zinc-800/80 overflow-hidden shadow-2xl shadow-black/10 dark:shadow-black/20">
                  {/* Terminal Header - Minimal */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800/60">
                    <div className="flex gap-1.5">
                      <div className="w-[10px] h-[10px] rounded-full bg-zinc-400 dark:bg-zinc-700 group-hover:bg-red-500/90 transition-colors" />
                      <div className="w-[10px] h-[10px] rounded-full bg-zinc-400 dark:bg-zinc-700 group-hover:bg-yellow-500/90 transition-colors" />
                      <div className="w-[10px] h-[10px] rounded-full bg-zinc-400 dark:bg-zinc-700 group-hover:bg-green-500/90 transition-colors" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const code = [
                          "import { Client, IdbSwapStorage } from '@lendasat/lendaswap-sdk-pure'",
                          "",
                          "const client = await Client.builder()",
                          "  .withSwapStorage(new IdbSwapStorage()).build()",
                          "",
                          "const swap = await client.createArkadeToEvmSwap({",
                          "  targetToken: 'usdc_arb', sourceAmount: 100000",
                          "})",
                        ].join("\n");
                        navigator.clipboard.writeText(code);
                        setCopiedTerminal(true);
                        setTimeout(() => setCopiedTerminal(false), 2000);
                      }}
                      className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                      title="Copy code"
                    >
                      {copiedTerminal ? (
                        <ClipboardCheck className="h-3 w-3 text-green-500" />
                      ) : (
                        <Clipboard className="h-3 w-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                      )}
                    </button>
                  </div>
                  {/* Terminal Content */}
                  <div className="px-3 py-2.5 md:px-4 md:py-3 font-mono text-[8px] md:text-[10px] leading-[1.7]">
                    <div className="docs-terminal-line docs-terminal-line-1 text-zinc-600 dark:text-zinc-400">
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        $
                      </span>{" "}
                      <span className="text-zinc-500">npm i</span>{" "}
                      @lendasat/lendaswap-sdk-pure
                    </div>
                    <div className="docs-terminal-line docs-terminal-line-2 mt-1.5 text-zinc-600 dark:text-zinc-400">
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        import
                      </span>{" "}
                      {"{"}{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        Client
                      </span>
                      ,{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        IdbSwapStorage
                      </span>{" "}
                      {"}"}{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        from
                      </span>{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        '@lendasat/lendaswap-sdk-pure'
                      </span>
                    </div>
                    <div className="docs-terminal-line docs-terminal-line-3 mt-1 text-zinc-600 dark:text-zinc-400">
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        const
                      </span>{" "}
                      <span className="text-blue-600 dark:text-blue-300">
                        client
                      </span>{" "}
                      ={" "}
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        await
                      </span>{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        Client
                      </span>
                      .
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        builder
                      </span>
                      ()
                    </div>
                    <div className="docs-terminal-line docs-terminal-line-4 mt-1 text-zinc-600 dark:text-zinc-400">
                      {"  "}.
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        withSwapStorage
                      </span>
                      (
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        new
                      </span>{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        IdbSwapStorage
                      </span>
                      ()).
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        build
                      </span>
                      ()
                    </div>
                    <div className="docs-terminal-line docs-terminal-line-5 mt-1 text-zinc-600 dark:text-zinc-400">
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        const
                      </span>{" "}
                      <span className="text-blue-600 dark:text-blue-300">
                        swap
                      </span>{" "}
                      ={" "}
                      <span className="text-[#7a8a0e] dark:text-lime-400">
                        await
                      </span>{" "}
                      client.
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        createArkadeToEvmSwap
                      </span>
                      ({"{"}
                    </div>
                    <div className="docs-terminal-line docs-terminal-line-6 mt-1 text-zinc-600 dark:text-zinc-400">
                      {"  "}
                      <span className="text-blue-600 dark:text-blue-300">
                        targetToken
                      </span>
                      :{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        'usdc_arb'
                      </span>
                      ,{" "}
                      <span className="text-blue-600 dark:text-blue-300">
                        sourceAmount
                      </span>
                      :{" "}
                      <span className="text-[#7a8a0e] dark:text-lime-300">
                        100000
                      </span>
                      {" }"})
                      <span className="docs-terminal-cursor text-[#7a8a0e] dark:text-lime-400 ml-0.5">
                        |
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Text - Bottom aligned */}
              <div>
                <div className="text-base md:text-xl font-bold tracking-tight text-foreground">
                  Developer Docs
                </div>
                <a
                  href="https://docs.satora.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-1.5 text-xs md:text-sm font-medium text-lime-400 hover:text-lime-300 transition-colors"
                >
                  View docs
                  <ArrowDown className="h-3 w-3 rotate-[-90deg]" />
                </a>
              </div>
            </div>
          </div>

          {/* Powered by Arkade - Square */}
          <div className="md:col-span-2 group relative aspect-square overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-purple-500/5 p-4 md:p-6 shadow-sm transition-all duration-300 hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/5">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-transparent to-purple-500/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="relative h-full flex flex-col justify-between">
              {/* Pixel art space invader with classic animation on hover */}
              <div className="flex-1 flex items-center justify-center">
                <style>{`
                        @keyframes invaderMove {
                          0%, 100% { transform: translateX(-10px); }
                          50% { transform: translateX(10px); }
                        }
                        @keyframes invaderFrame {
                          0%, 49% { opacity: 1; }
                          50%, 100% { opacity: 0; }
                        }
                        @keyframes invaderFrame2 {
                          0%, 49% { opacity: 0; }
                          50%, 100% { opacity: 1; }
                        }
                        .invader-container {
                          animation: none;
                        }
                        .group:hover .invader-container {
                          animation: invaderMove 1.5s ease-in-out infinite;
                        }
                        .invader-frame1 {
                          opacity: 1;
                        }
                        .invader-frame2 {
                          opacity: 0;
                        }
                        .group:hover .invader-frame1 {
                          animation: invaderFrame 0.8s steps(1) infinite;
                        }
                        .group:hover .invader-frame2 {
                          animation: invaderFrame2 0.8s steps(1) infinite;
                        }
                      `}</style>
                <div className="relative invader-container">
                  {/* Frame 1 - legs out */}
                  <div className="grid grid-cols-11 gap-[1px] sm:gap-[2px] md:gap-[2px] lg:gap-[3px] absolute inset-0 invader-frame1">
                    {[
                      [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
                      [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                      [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
                      [0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0],
                      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                      [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
                      [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
                      [0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
                    ]
                      .flat()
                      .map((filled, i) => (
                        <div
                          key={`p1-${i.toString()}`}
                          className={`w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 lg:w-3.5 lg:h-3.5 rounded-sm ${
                            filled
                              ? "bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                              : "bg-transparent"
                          }`}
                        />
                      ))}
                  </div>
                  {/* Frame 2 - legs in */}
                  <div className="grid grid-cols-11 gap-[1px] sm:gap-[2px] md:gap-[2px] lg:gap-[3px] invader-frame2">
                    {[
                      [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
                      [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
                      [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
                      [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
                      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                      [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
                      [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
                      [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
                    ]
                      .flat()
                      .map((filled, i) => (
                        <div
                          key={`p2-${i.toString()}`}
                          className={`w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 lg:w-3.5 lg:h-3.5 rounded-sm ${
                            filled
                              ? "bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                              : "bg-transparent"
                          }`}
                        />
                      ))}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-base md:text-xl font-bold tracking-tight text-foreground">
                  Powered by Arkade · Bitcoin L2
                </div>
                <a
                  href="https://arkadeos.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-1.5 text-xs md:text-sm font-medium text-purple-500 hover:text-purple-400 transition-colors"
                >
                  Learn more
                  <ArrowDown className="h-3 w-3 rotate-[-90deg]" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row - 3 Feature Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Instant */}
          <div className="group relative aspect-[4/3] md:aspect-square overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-lime-400/5 p-4 md:p-6 shadow-sm transition-all duration-300 hover:border-lime-400/30 hover:shadow-xl hover:shadow-lime-400/5">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-400/0 via-transparent to-lime-400/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <style>{`
                    @keyframes coinSpinLeft {
                      0% { transform: translateX(0) rotateY(0deg); }
                      50% { transform: translateX(20px) rotateY(180deg); }
                      100% { transform: translateX(0) rotateY(360deg); }
                    }
                    @keyframes coinSpinRight {
                      0% { transform: translateX(0) rotateY(0deg); }
                      50% { transform: translateX(-20px) rotateY(180deg); }
                      100% { transform: translateX(0) rotateY(360deg); }
                    }
                    .instant-coin-left, .instant-coin-right {
                      animation: none;
                    }
                    .group:hover .instant-coin-left {
                      animation: coinSpinLeft 0.8s ease-in-out;
                    }
                    .group:hover .instant-coin-right {
                      animation: coinSpinRight 0.8s ease-in-out;
                    }
                  `}</style>
            <div className="relative h-full flex flex-col justify-between">
              {/* Coin swap animation area */}
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-3 md:gap-5">
                  {/* USDT Coin - Left - Glossy Lime Glass */}
                  <div
                    className="instant-coin-left w-14 h-14 md:w-[72px] md:h-[72px] rounded-full flex items-center justify-center shadow-xl relative"
                    style={{
                      perspective: "1000px",
                      transformStyle: "preserve-3d",
                      background:
                        "linear-gradient(135deg, rgba(194,232,33,0.9) 0%, rgba(163,196,16,0.8) 50%, rgba(132,160,10,0.9) 100%)",
                      boxShadow:
                        "0 8px 32px rgba(163,196,16,0.3), inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div
                      className="absolute inset-1 rounded-full"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)",
                      }}
                    />
                    {/* Tether T Symbol */}
                    <svg
                      viewBox="0 0 339.43 295.27"
                      className="relative w-7 h-7 md:w-9 md:h-9"
                      fill="white"
                      aria-hidden="true"
                    >
                      <path d="M191.19,144.8v0c-1.2.09-7.4,0.46-21.23,0.46-11,0-18.81-.33-21.55-0.46v0c-42.51-1.87-74.24-9.27-74.24-18.13s31.73-16.25,74.24-18.15v28.91c2.78,0.2,10.74.67,21.74,0.67,13.2,0,19.81-.55,21-0.66v-28.9c42.42,1.89,74.08,9.29,74.08,18.13s-31.65,16.24-74.08,18.12h0Zm0-39.25V79.68h59.2V40.23H89.21V79.68h59.19v25.86c-48.11,2.21-84.29,11.74-84.29,23.16s36.18,20.94,84.29,23.16v82.9h42.78v-82.93c48-2.21,84.12-11.73,84.12-23.14s-36.09-20.93-84.12-23.15h0Z" />
                    </svg>
                  </div>
                  {/* Swap arrows */}
                  <div className="flex flex-col items-center gap-0.5">
                    <ArrowLeftRight className="w-5 h-5 md:w-7 md:h-7 text-lime-400/70" />
                  </div>
                  {/* Bitcoin Coin - Right - Glossy Lime Glass */}
                  <div
                    className="instant-coin-right w-14 h-14 md:w-[72px] md:h-[72px] rounded-full flex items-center justify-center shadow-xl relative"
                    style={{
                      perspective: "1000px",
                      transformStyle: "preserve-3d",
                      background:
                        "linear-gradient(135deg, rgba(194,232,33,0.95) 0%, rgba(163,196,16,0.85) 50%, rgba(132,160,10,0.95) 100%)",
                      boxShadow:
                        "0 8px 32px rgba(163,196,16,0.3), inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div
                      className="absolute inset-1 rounded-full"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)",
                      }}
                    />
                    {/* Bitcoin Logo */}
                    <BitcoinIcon className="relative w-7 h-7 md:w-9 md:h-9 [&_path]:fill-white" />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-base md:text-xl font-bold tracking-tight text-foreground">
                  Instant
                </div>
                <div className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-0.5">
                  Near-instant settlement
                </div>
              </div>
            </div>
          </div>

          {/* Atomic Swaps - Peer to Peer Connection */}
          <div className="group relative md:col-span-2 aspect-[4/3] md:aspect-auto overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-lime-400/5 p-4 md:p-6 shadow-sm transition-all duration-300 hover:border-lime-400/30 hover:shadow-xl hover:shadow-lime-400/5">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-400/0 via-transparent to-lime-400/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <style>{`
                    .p2p-line {
                      stroke-dasharray: 4 4;
                      transition: all 0.4s ease;
                    }
                    .group:hover .p2p-line {
                      stroke-dasharray: none;
                      stroke-width: 2;
                      filter: drop-shadow(0 0 4px rgba(163,196,16,0.6));
                    }
                    .p2p-node {
                      transition: all 0.3s ease;
                    }
                    .group:hover .p2p-node {
                      filter: drop-shadow(0 0 12px rgba(163,196,16,0.5));
                      transform: scale(1.05);
                    }
                    .p2p-check {
                      opacity: 0;
                      transform: scale(0.5);
                      transition: all 0.3s ease 0.2s;
                    }
                    .group:hover .p2p-check {
                      opacity: 1;
                      transform: scale(1);
                    }
                  `}</style>
            <div className="relative h-full flex flex-col justify-between">
              {/* Peer-to-Peer Connection Visualization */}
              <div className="flex-1 flex items-center justify-center py-4">
                <div className="flex items-center gap-4 md:gap-8">
                  {/* Left Node - You */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="p2p-node w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center relative"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(194,232,33,0.9) 0%, rgba(163,196,16,0.85) 50%, rgba(132,160,10,0.9) 100%)",
                        boxShadow:
                          "0 4px 20px rgba(163,196,16,0.25), inset 0 1px 2px rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }}
                    >
                      <Key className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </div>
                    <span className="text-[10px] md:text-xs text-muted-foreground font-medium">
                      You
                    </span>
                  </div>

                  {/* Connection Line with Checkmark */}
                  <div className="relative flex items-center">
                    <svg
                      width="80"
                      height="40"
                      viewBox="0 0 80 40"
                      className="md:w-[120px]"
                      aria-hidden="true"
                    >
                      {/* Dashed connection line */}
                      <line
                        x1="0"
                        y1="20"
                        x2="80"
                        y2="20"
                        className="p2p-line"
                        stroke="#a3c410"
                        strokeWidth="1.5"
                      />
                      {/* Center checkmark circle */}
                      <g
                        className="p2p-check"
                        style={{ transformOrigin: "40px 20px" }}
                      >
                        <circle cx="40" cy="20" r="12" fill="#a3c410" />
                        <path
                          d="M34 20 L38 24 L46 16"
                          stroke="white"
                          strokeWidth="2"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    </svg>
                  </div>

                  {/* Right Node - Peer */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="p2p-node w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(194,232,33,0.9) 0%, rgba(163,196,16,0.85) 50%, rgba(132,160,10,0.9) 100%)",
                        boxShadow:
                          "0 4px 20px rgba(163,196,16,0.25), inset 0 1px 2px rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }}
                    >
                      <Shield className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </div>
                    <span className="text-[10px] md:text-xs text-muted-foreground font-medium">
                      Peer
                    </span>
                  </div>
                </div>
              </div>

              {/* Text content */}
              <div>
                <div className="text-base md:text-xl font-bold tracking-tight text-foreground">
                  Atomic Swaps
                </div>
                <div className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-0.5">
                  Trustless · Self-custodial
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mx-auto max-w-2xl mt-24">
        <h3 className="text-xl font-semibold mb-6 text-center">
          Frequently Asked Questions
        </h3>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="how" className="border-border/50">
            <AccordionTrigger className="text-left">
              How does it work?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Satora uses Hash Time-Locked Contracts (HTLCs) to enable trustless
              atomic swaps. When you start a swap, both parties lock their funds
              in smart contracts. The swap either completes fully or both
              parties get refunded - there's no way for anyone to steal your
              funds. We support Bitcoin Lightning, Arkade (Bitcoin L2), and EVM
              chains like Polygon and Ethereum.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="custody" className="border-border/50">
            <AccordionTrigger className="text-left">
              Is Satora self-custodial?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes! Satora is fully self-custodial. Your keys, your coins. You
              can backup your recovery phrase anytime by clicking the key icon
              in the header - you can show, download, or import your seedphrase.
              Store it safely - this phrase allows you to recover your funds if
              anything goes wrong.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="limits" className="border-border/50">
            <AccordionTrigger className="text-left">
              What is the maximum swap amount?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              In general, you can swap $1-$1000 USD without any problems. For
              larger amounts, please contact us directly to confirm
              availability.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="stuck" className="border-border/50">
            <AccordionTrigger className="text-left">
              What if my swap gets stuck?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Satora uses atomic swaps, which means your funds are always safe.
              If a swap doesn't complete, you can always recover your funds.
              Click the swap icon in the header to view your swap history and
              initiate a refund if needed. Note: depending on the swap currency,
              lock times may vary. In the worst case, your funds might be locked
              for up to 2 weeks before you can claim them back.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="opensource" className="border-border/50">
            <AccordionTrigger className="text-left">
              Is Satora open source?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes! Satora is fully open source. You can review our code,
              contribute, or run your own instance. Check out our GitHub at{" "}
              <a
                href="https://github.com/lendasat/lendaswap-sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                github.com/lendasat/lendaswap
              </a>
              .
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </>
  );
}
