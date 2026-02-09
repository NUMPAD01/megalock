"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI } from "@/lib/contracts";
import { FadeIn } from "@/components/FadeIn";

export default function Dashboard() {
  const { data: nextLockId } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "nextLockId",
  });

  const totalLocks = nextLockId !== undefined ? Number(nextLockId) : null;

  return (
    <div className="space-y-20 pb-12">
      {/* Hero */}
      <section className="text-center pt-8 md:pt-16">
        <FadeIn>
          <p className="text-primary text-sm font-semibold tracking-wider uppercase mb-4">Built on MegaETH</p>
        </FadeIn>
        <FadeIn delay={100}>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">
            Secure Your Tokens<br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              with MegaScan
            </span>
          </h1>
        </FadeIn>
        <FadeIn delay={200}>
          <p className="text-muted text-lg md:text-xl mt-6 max-w-2xl mx-auto">
            Lock, vest, and burn ERC-20 tokens on MegaETH. Transparent on-chain vesting schedules trusted by builders and communities.
          </p>
        </FadeIn>
        <FadeIn delay={300}>
          <div className="flex items-center justify-center gap-4 mt-10">
            <Link
              href="/create"
              className="bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-8 rounded-xl transition-colors text-sm"
            >
              Create a Lock
            </Link>
            <Link
              href="/explore"
              className="bg-card border border-card-border hover:border-primary text-foreground font-semibold py-3 px-8 rounded-xl transition-colors text-sm"
            >
              Explore Locks
            </Link>
          </div>
        </FadeIn>
      </section>

      {/* Live stats */}
      <section>
        <FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-4xl font-extrabold text-primary">{totalLocks ?? "—"}</p>
              <p className="text-muted text-sm mt-2">Locks Created</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-4xl font-extrabold text-accent">3</p>
              <p className="text-muted text-sm mt-2">Vesting Types</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-4xl font-extrabold text-danger">MegaBurn</p>
              <p className="text-muted text-sm mt-2">On-chain Token Burn</p>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Features */}
      <section>
        <FadeIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3">Everything You Need</h2>
          <p className="text-muted text-center mb-10 max-w-xl mx-auto">All-in-one token management. Lock liquidity, vest team tokens, burn supply — fully on-chain.</p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />,
              title: "Time Lock",
              desc: "Lock tokens until a fixed date. Simple and secure.",
              href: "/create",
              color: "text-primary",
            },
            {
              icon: <path d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />,
              title: "Linear Vesting",
              desc: "Gradual token release over time with optional cliff.",
              href: "/create",
              color: "text-accent",
            },
            {
              icon: <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
              title: "Stepped Vesting",
              desc: "Milestone-based unlock at specific dates.",
              href: "/create",
              color: "text-success",
            },
            {
              icon: <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />,
              title: "Burn Tokens",
              desc: "Permanently destroy tokens. Tracked on-chain.",
              href: "/burn",
              color: "text-danger",
            },
          ].map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 100}>
              <Link
                href={feature.href}
                className="bg-card border border-card-border rounded-xl p-6 hover:border-primary/40 transition-all group block h-full"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`${feature.color} mb-4`}>
                  {feature.icon}
                </svg>
                <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">{feature.title}</h3>
                <p className="text-muted text-sm mt-2">{feature.desc}</p>
              </Link>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <FadeIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3">How It Works</h2>
          <p className="text-muted text-center mb-10 max-w-xl mx-auto">Three simple steps to secure your tokens.</p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Connect Wallet", desc: "Connect your wallet to MegaETH network." },
            { step: "2", title: "Choose Lock Type", desc: "Select time lock, linear vesting, or stepped vesting." },
            { step: "3", title: "Lock & Relax", desc: "Tokens are secured on-chain. Claim when vested." },
          ].map((item, i) => (
            <FadeIn key={item.step} delay={i * 150}>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="text-muted text-sm mt-2">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Token Search CTA */}
      <section>
        <FadeIn>
          <div className="bg-card border border-card-border rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Research Any Token</h2>
            <p className="text-muted max-w-lg mx-auto mb-8">
              Look up any ERC-20 token on MegaETH. See holders, dev wallet activity, locked tokens, burns, and price charts.
            </p>
            <Link
              href="/token"
              className="bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-8 rounded-xl transition-colors text-sm inline-block"
            >
              Search Token
            </Link>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
