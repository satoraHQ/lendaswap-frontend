import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "#/components/ui/button";

export function TermsOfServicePage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Terms of Service | Satora";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 md:px-16 py-10 md:py-20">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-10 gap-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          Terms of Service
        </h1>
        <p className="text-muted-foreground mt-2 mb-12">
          Last updated: January 2026
        </p>

        <div className="space-y-10 text-[15px] md:text-base leading-7 text-muted-foreground">
          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              1. Introduction
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of
              Satora, an atomic swap service operated by Sofbear Consulting
              Ltd., a company registered in the British Virgin Islands
              (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;). By accessing or using our service, you agree to
              be bound by these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              2. Service Description
            </h2>
            <p>
              Satora provides an atomic swap service that enables users to
              exchange Bitcoin (BTC) with Wrapped Bitcoin (wBTC) and other
              tokens across multiple blockchain networks, including but not
              limited to Ethereum, Polygon, and Arbitrum.
            </p>
            <p className="mt-4">
              When a user wishes to acquire BTC using tokens on Ethereum,
              Polygon, or other supported networks, the deposited funds are
              first converted to wBTC through decentralized exchanges (such as
              Uniswap), and then atomically swapped to BTC, which is sent to the
              user&apos;s specified target address.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              3. Refund Policy
            </h2>
            <p>
              In the event that a swap cannot be completed or requires a refund,
              users will receive their initial deposited asset back to their
              original address. For swaps initiated from Ethereum, Polygon, or
              other EVM-compatible networks to BTC, please note that:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>Refunds will be processed in the original asset deposited</li>
              <li>Refunds will be sent to the original source address</li>
              <li>
                Users may be subject to exchange rate fluctuations between the
                time of deposit and refund
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              4. Exchange Rate Risk
            </h2>
            <p>
              <strong className="text-foreground">IMPORTANT:</strong> Users
              participating in swaps from EVM-compatible networks (Ethereum,
              Polygon, etc.) to BTC are subject to exchange rate risk. We use
              decentralized exchanges, including Uniswap, to convert tokens to
              wBTC as part of the swap process.
            </p>
            <p className="mt-4">
              We do not provide any guarantees regarding exchange rates. Rates
              may fluctuate between the time you initiate a swap and when it is
              executed. You acknowledge and accept this risk when using our
              service.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              5. No Warranties
            </h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT ANY WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE
              DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>
                Warranties of merchantability or fitness for a particular
                purpose
              </li>
              <li>
                Warranties regarding the accuracy, reliability, or completeness
                of the service
              </li>
              <li>
                Warranties that the service will be uninterrupted, secure, or
                error-free
              </li>
              <li>
                Warranties regarding exchange rates, transaction timing, or
                execution
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              6. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SOFBEAR CONSULTING LTD.
              AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS,
              DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO
              YOUR USE OF THE SERVICE.
            </p>
            <p className="mt-4">
              This includes, without limitation, any losses resulting from:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>Exchange rate fluctuations</li>
              <li>Failed or delayed transactions</li>
              <li>Network congestion or blockchain issues</li>
              <li>Smart contract vulnerabilities</li>
              <li>
                Third-party service failures (including decentralized exchanges)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              7. User Responsibilities
            </h2>
            <p>By using our service, you acknowledge and agree that:</p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>
                You are solely responsible for securing your private keys and
                recovery phrases
              </li>
              <li>
                You understand the risks associated with cryptocurrency
                transactions
              </li>
              <li>
                You will verify all transaction details before confirming any
                swap
              </li>
              <li>
                You comply with all applicable laws and regulations in your
                jurisdiction
              </li>
              <li>
                You are not using the service for any illegal or prohibited
                purposes
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              8. Geographic Restrictions
            </h2>
            <p>
              Our service is not available to residents or citizens of, or
              persons located in, the following jurisdictions:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>The United States of America and its territories</li>
              <li>
                Countries subject to comprehensive sanctions by the United
                States, European Union, or United Nations, including but not
                limited to: North Korea, Iran, Syria, Cuba, and the Crimea,
                Donetsk, and Luhansk regions
              </li>
              <li>
                Any other jurisdiction where the use of cryptocurrency swap
                services is prohibited or requires licensing that we do not hold
              </li>
            </ul>
            <p className="mt-4">
              By using our service, you represent and warrant that you are not
              located in, incorporated or organized in, or a resident of any
              restricted jurisdiction, and that you are not subject to sanctions
              administered by OFAC, the UN Security Council, the EU, or any
              other governmental authority.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              9. Third-Party Services
            </h2>
            <p>
              Our service integrates with third-party protocols and services,
              including but not limited to Uniswap, various blockchain networks,
              and wallet providers. We are not responsible for the performance,
              availability, or security of these third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              10. Analytics &amp; Privacy
            </h2>
            <p>
              We use analytics to understand how our service is used and to
              improve reliability. Our analytics provider is PostHog, which
              processes data on servers located in the European Union.
            </p>
            <p className="mt-4">
              <strong className="text-foreground">Data we collect:</strong>
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>
                Swap lifecycle events (initiation, completion, refund) including
                swap direction, token types, and fee amounts
              </li>
              <li>Page views and general usage patterns</li>
              <li>
                Device and browser information (screen size, browser type,
                operating system)
              </li>
            </ul>
            <p className="mt-4">
              <strong className="text-foreground">
                Data we do NOT collect:
              </strong>
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>Wallet balances or private keys</li>
              <li>Seed phrases or recovery phrases</li>
              <li>
                Personally identifiable information (names, email addresses)
              </li>
              <li>
                IP addresses are not stored &mdash; only a rough geographic
                region is derived at ingestion time
              </li>
            </ul>
            <p className="mt-4">
              We automatically strip any sensitive data patterns (such as
              private keys or seed phrases) from analytics events before they
              are transmitted.
            </p>
            <p className="mt-4">
              <strong className="text-foreground">Legal basis:</strong> We
              process this data under legitimate interest (GDPR Article 6(1)(f))
              for the purpose of maintaining and improving the service. We have
              determined that this minimal, non-personal data collection does
              not override your rights and freedoms.
            </p>
            <p className="mt-4">
              <strong className="text-foreground">Opt-out:</strong> You may opt
              out of analytics by using a browser extension that blocks tracking
              scripts (such as uBlock Origin) or by enabling your browser&apos;s
              Do-Not-Track setting, which our analytics provider respects.
            </p>
            <p className="mt-4">
              Analytics data is retained for a maximum of 12 months from the
              date of collection, after which it is automatically deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              11. Modifications to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes
              will be effective immediately upon posting to our website. Your
              continued use of the service after any changes constitutes
              acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              12. Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of the British Virgin Islands, without regard to its
              conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              13. Contact
            </h2>
            <p>
              For questions about these Terms, please contact us through our
              official channels.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                Sofbear Consulting Ltd.
              </strong>
              <br />
              British Virgin Islands
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
