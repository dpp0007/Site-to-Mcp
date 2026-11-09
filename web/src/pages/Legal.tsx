import { CONTACT, OPERATOR } from "../lib/config";
import { Page, Section } from "../components/ui";

const UPDATED = "9 November 2026";
const contact = CONTACT ? <a href={`mailto:${CONTACT}`}>{CONTACT}</a> : <span>the contact address published by the operator</span>;

export function Privacy() {
  return (
    <Page title="Privacy policy" lead={`Last updated ${UPDATED}. This explains what ${OPERATOR} (“we”) processes when you use the site-to-mcp website and API. We collect as little as the service needs.`}>
      <Section title="The short version">
        <ul>
          <li>The website has no cookies, no analytics and no advertising. Fonts are served from our own domain.</li>
          <li>Your API key is stored on our server only as a one-way hash.</li>
          <li>The addresses and search terms you send to a tool are passed to TinyFish to read the page, then discarded after a short cache period.</li>
          <li>We never sell personal data.</li>
        </ul>
      </Section>
      <Section title="What we process">
        <ul>
          <li><b>Tool requests.</b> The tool name and its arguments (for example a page URL, a course code or a date). They are sent to TinyFish, our processor, so it can fetch and read the public page. We do not log the arguments.</li>
          <li><b>Results.</b> Public web content returned by the tool. It is cached on the server for between 10 minutes and one day so repeat calls are fast and cheap, then it expires. The cache is on temporary disk and is cleared when the server restarts.</li>
          <li><b>Access logs.</b> For each request: time, method, path, the name of the API key used, status code and duration. These contain no request bodies, arguments or keys.</li>
          <li><b>Network data.</b> Our hosting providers receive your IP address as part of delivering traffic and may log it. Our application uses IP addresses only to rate-limit public endpoints, in memory, and does not store them.</li>
          <li><b>API keys.</b> Keys made on the Setup page are signed, not stored: we keep no record of who created one, only a random id in the key itself. They expire after 30 days. Keys issued by the operator by hand are kept only as a SHA-256 hash and a label. To limit abuse, your IP address is counted in memory (key creation per day and request volume) and is forgotten on restart.</li>
          <li><b>The Setup page.</b> The key you type stays in your browser's memory. It is not saved, and is sent only to the server address you entered, when you press Test connection.</li>
        </ul>
      </Section>
      <Section title="Why we process it (legal bases)">
        <p>To provide the service you asked for (performance of a contract), to keep it secure and prevent abuse (legitimate interests), and to meet legal obligations. We do not use consent-based tracking, so there is no cookie banner.</p>
      </Section>
      <Section title="Who else is involved">
        <ul>
          <li><b>TinyFish</b>: fetches and renders pages and runs browser agents on our behalf. It receives the URLs and instructions in your requests.</li>
          <li><b>Render</b> hosts the API and <b>Vercel</b> hosts this website. Both process connection data to deliver traffic.</li>
          <li>The websites you point a tool at receive requests from our providers, not from your device.</li>
        </ul>
      </Section>
      <Section title="Please do not send personal data">
        <p>The tools are for public web pages. Do not put passwords, tokens, personal identifiers or private links in URLs or arguments: they would be sent to the target site and to TinyFish.</p>
      </Section>
      <Section title="Retention">
        <p>Cached results: up to one day. Access logs: kept for as long as our host retains them, normally no more than 30 days. Key hashes: until the key is revoked.</p>
      </Section>
      <Section title="Your rights">
        <p>Depending on where you live you may have the right to access, correct, delete or export personal data, to object to processing, and to complain to a data-protection authority. Because we hold almost no personal data, most requests are answered by confirming which key label is yours and revoking it. Contact: {contact}.</p>
      </Section>
      <Section title="Children, transfers and changes">
        <p>The service is not directed at children under 16. Our providers may process data outside your country; we rely on their contractual safeguards. We will update this page and its date when practices change.</p>
      </Section>
      <p className="text-[14px] text-mute">This page is a plain-language template that matches how the software works. The operator should review it with a lawyer for their jurisdiction before launch.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of use" lead={`Last updated ${UPDATED}. By using the service you agree to these terms with ${OPERATOR}.`}>
      <Section title="What the service does">
        <p>site-to-mcp lets software read public web pages through TinyFish and returns structured data. It is provided as is, without warranty. Websites change, so a tool can stop working: it is built to fail with a clear error rather than return wrong data, but we cannot promise accuracy or availability.</p>
      </Section>
      <Section title="Acceptable use">
        <ul>
          <li>Use it only on public pages that you are allowed to access automatically. The service enforces robots.txt, but robots.txt is not the only rule: respect each site's terms and local law.</li>
          <li>Do not use it to access accounts, bypass logins, paywalls or captchas, or collect personal data about private individuals.</li>
          <li>Do not attempt to overload, probe or abuse the service or the sites it reads. Rate limits exist for this reason.</li>
          <li>You are responsible for what you do with the data and for any key issued to you. Keep it secret and tell us if it leaks.</li>
        </ul>
      </Section>
      <Section title="Keys, limits and suspension">
        <p>Access needs an API key with per-minute and daily limits. We may change limits, revoke keys or suspend access, for example to stop abuse or control cost.</p>
      </Section>
      <Section title="Liability">
        <p>To the extent the law allows, we are not liable for indirect or consequential loss, or for decisions you take based on data returned by a tool. Nothing here limits liability that cannot be limited by law.</p>
      </Section>
      <Section title="Contact and changes">
        <p>Questions: {contact}. We may update these terms; continued use after a change means you accept it.</p>
      </Section>
      <p className="text-[14px] text-mute">Template for the operator to review with a lawyer before launch.</p>
    </Page>
  );
}

export function Security() {
  return (
    <Page title="Security" lead="Everything that can cost money or leak data lives on the server. The browser and your agent only ever see typed results.">
      <Section title="How it is built">
        <ul>
          <li><b>Secrets stay server-side.</b> The TinyFish key exists only in the server's environment. It is never sent to the website, an MCP client or a log.</li>
          <li><b>Per-user keys.</b> Each client gets its own key. Keys are stored as SHA-256 hashes, compared in constant time, and revoked by removing one entry. A leaked server config does not reveal usable keys.</li>
          <li><b>Fail closed.</b> The hosted server refuses to start with no keys configured.</li>
          <li><b>Rate limits and quotas</b> per key (per minute and per day), per IP on public endpoints, and a 64 KB request cap, so abuse and runaway spend are bounded.</li>
          <li><b>robots.txt enforced</b> on every call, for the exact URL. Disallowed means <code>BLOCKED</code>, not a workaround.</li>
          <li><b>Input validation.</b> Typed schemas, URL checks (http and https only, no private or local addresses), and pattern checks on identifiers.</li>
          <li><b>Browser protections.</b> HTTPS only with HSTS, a strict Content-Security-Policy, <code>X-Frame-Options: DENY</code>, <code>nosniff</code>, no referrer, and a CORS allow-list limited to this site.</li>
          <li><b>DNS-rebinding protection</b> on the MCP endpoint through an allowed-hosts list.</li>
          <li><b>Minimal logging.</b> Method, path, key label, status and time. Never bodies, arguments or keys.</li>
          <li><b>No Docker, no shell.</b> The API is a small Python service on Render's managed runtime; it never executes input.</li>
        </ul>
      </Section>
      <Section title="What it does not do">
        <ul>
          <li>It does not read pages behind a login, and should not be given private links.</li>
          <li>It cannot guarantee a target site's terms permit automation. The access check is advisory; you decide.</li>
          <li>Rate-limit counters live in server memory, so a restart resets them and limits apply per instance.</li>
        </ul>
      </Section>
      <Section title="Report a vulnerability">
        <p>Please report security issues privately to {CONTACT ? <a href={`mailto:${CONTACT}`}>{CONTACT}</a> : <span>the operator's security contact</span>} instead of opening a public issue. Include steps to reproduce. We will acknowledge quickly and credit you if you wish.</p>
      </Section>
    </Page>
  );
}
