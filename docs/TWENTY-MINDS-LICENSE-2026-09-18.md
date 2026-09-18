# Twenty Minds — KingCode Lens v1.0.0 license posture (2026-09-18)

Decision: "Should KingCode Lens v1.0.0 ship under a proprietary CWI license
(free personal/dev/eval, paid commercial, no redistribution) instead of
Apache-2.0 open source?"

Facts (max 5):
1. Repo is public under CumulativeWebInc; today Apache-2.0 plus a separate
   COMMERCIAL-LICENSE.md doc.
2. External adoption is zero verified equips; the product is pre-revenue,
   simulator-only, with no on-hardware claims.
3. Black's standing goals: monetize premium software and sell it; CWI keeps
   all IP; $0 paths; no lawyer on call.
4. The natural buyers are orgs deploying eyewear voice agents in production;
   the natural adopters are individual devs evaluating the simulator.
5. Alternatives: stay Apache-2.0, dual-license (Apache core + paid premium),
   or close the source entirely.

## Verdicts (one sentence + one risk each)

1. Skeptic — Ship proprietary; the loudest case for Apache is ideological,
   not economic, and nobody is forking a zero-equip simulator for the license.
   Risk: if the license is the real reason adoption is zero, proprietary
   doubles the barrier we never measured.
2. Data scientist — Ship proprietary; with zero external users there is no
   open-source conversion data to lose, so the downside is unmeasurable and
   the upside (priced commercial tier) is the only testable variable.
   Risk: we have no pricing data either, so "paid commercial" is a price tag
   with no demand curve behind it.
3. User advocate — Ship proprietary with the free personal/dev/eval tier kept
   genuinely free; the evaluators this product needs are served, and the
   buyers who need support get a vendor to call.
   Risk: "evaluation" is ambiguous — a startup evaluating for 6 months of
   production-adjacent use will feel baited.
4. Contrarian — Stay Apache-2.0; a source-available proprietary license on a
   public repo reads as open-washing, and one accusation of license theater
   costs more trust than the commercial tier earns.
   Risk: purity keeps us noble and broke — Black's actual goal is revenue,
   not licenses on a wall.
5. Engineer — Ship proprietary; a single LICENSE file is simpler to maintain
   than the current dual-posture (Apache + separate commercial doc) that
   already confused the posture.
   Risk: "no redistribution" on a public GitHub repo is enforced by lawyers
   we don't have, not by code.
6. Economist — Ship proprietary; free evaluation is the sampling cost that
   builds the funnel, and the paid commercial tier captures the surplus from
   orgs that would otherwise free-ride on support.
   Risk: without a published price, "contact us" becomes a negotiation tax
   that kills small buyers.
7. Security reviewer — Ship proprietary; the "no redistribution" clause at
   least gives CWI a takedown basis if someone republishes the repo with
   malware injected.
   Risk: the clause is near-unenforceable in practice and creates a false
   sense of protection.
8. Child-of-five explainer — Ship proprietary: "you can play with it and
   build with it for free; if you sell it or use it at work, you pay the
   people who made it."
   Risk: a five-year-old also asks "but it's on the internet for free?" —
   and that's the whole enforcement problem in one sentence.
9. 10-year historian — Ship proprietary; the 2036 record will show whether
   CWI built a software business or gave away its first real product, and
   businesses keep their IP.
   Risk: historians also record the products that died behind a paywall
   nobody knocked on.
10. Devil's accountant — Ship proprietary; the true cost is near-zero (one
    LICENSE file, one licensing.md, an inbox), while staying Apache costs
    the option value of every future commercial deal signed away irrevocably.
    Risk: the hidden cost is Black's time answering "what does evaluation
    cover?" emails forever.
11. Field operator — Ship proprietary; my worst Tuesday is answering
    license-boundary questions, which a crisp licensing.md with examples
    prevents better than Apache's 9 sections of legalese.
    Risk: crisp docs don't stop edge cases — "is my hackathon demo
    commercial?" will still arrive.
12. Systems thinker — Ship proprietary; the license is the top of the funnel
    for the whole monetization loop (evaluate → contact → commercial deal →
    revenue → more builds), and Apache breaks that loop at step one.
    Risk: a paywall at the top of the funnel also breaks the adoption loop
    that feeds it.
13. Risk underwriter — Ship proprietary; the tail risk of Apache is an org
    shipping KingCode Lens inside a commercial product with zero obligation
    to CWI — uncapped downside, and the exposed party is Black.
    Risk: the tail risk of proprietary is a contributor's PR we can't accept
    without a CLA we haven't written.
14. Open-source maintainer — Stay Apache-2.0; strangers fork and trust what
    they can read, modify, and ship, and a proprietary public repo gets
    drive-by suspicion instead of drive-by contributors.
    Risk: we have no community to lose — optimizing for hypothetical
    contributors over real revenue is premature.
15. Negotiator — Ship proprietary; "free for eval, paid for production" is
    the opening offer that gives CWI walk-away leverage in every commercial
    conversation, while Apache is a pre-concession.
    Risk: leverage against nobody is theater — no inbound commercial interest
    exists yet.
16. Time traveler (2036) — Ship proprietary; looking back, the products that
    funded the company were the ones with a price, and v1.0.0 was the moment
    CWI declared itself a software vendor.
    Risk: the traveler also remembers v1.0.0 sitting at zero equips for a
    year — the license didn't cause it, but it didn't cure it either.
17. First-principles physicist — Ship proprietary; what must be true is that
    code on a public repo is copied regardless of license, so the license's
    real function is defining the commercial relationship for honest buyers,
    not stopping dishonest ones.
    Risk: if it can't stop copying, its only value is signaling — and the
    signal says "we'd rather be paid than be used."
18. Ethicist — Ship proprietary with a genuinely free eval tier; no one is
    harmed — evaluators keep full access, and charging orgs for production
    use of someone's labor is the fair arrangement.
    Risk: "no redistribution" harms the commons slightly — researchers and
    archivists who mirror for preservation become violators.
19. Competitor analyst — Ship proprietary; the strongest competitor (Meta's
    own toolchain) is free, so CWI's answer can't be "freer" — it has to be
    "yours to buy with support," a lane Meta doesn't sell.
    Risk: Meta's free official simulator makes any paid CWI tier compete
    against $0 from the platform owner.
20. Black's chair — Ship proprietary; his grants say monetize premium
    software, keep the IP, $0 paths first — a self-written license costs
    nothing, keeps every right, and turns the repo into a product instead of
    a giveaway.
    Risk: he'd also ask "who's buying?" — and the honest answer is nobody
    yet, so the license must not slow the evaluation loop that finds the
    first buyer.

## Synthesis

- Decision: Ship v1.0.0 under the single proprietary CWI license (free
  personal/dev/eval, paid commercial/production, no redistribution, IP
  retained, as-is).
- Why: Black's chair (monetize, keep IP, $0), the economist (free eval as
  sampling cost, paid tier captures surplus), and the data scientist (zero
  existing open-source conversion data to lose) converged — there is no
  open-source community to alienate yet, and Apache would irrevocably sign
  away the commercial option.
- Dissent recorded: the contrarian's strongest minority — a proprietary
  license on a public repo risks reading as open-washing, and one trust hit
  costs more than an unpriced commercial tier earns; mitigation is radical
  plain-language honesty in licensing.md about what is free and what is not.
- Confidence: medium — fact that would change it: a credible inbound signal
  (e.g., an org asking to embed the simulator) that names open-source
  licensing as the blocker.
- Changed the pre-run lean? No — the lean was already the proprietary
  posture from the task brief; the run hardened the terms (publish evaluation
  boundaries with examples, name the contact, state the no-CLA contributor
  position).

Action: draft LICENSE + docs/licensing.md with explicit evaluation
boundaries and examples, per the field operator's and child-of-five minds.
