import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  turbine_code: string;
  yaw_err_deg: number;
  azimuth_deg: number | null;
  status: string;
  verdict: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type PinRow = {
  turbine_code: string;
  azimuth_deg: number;
  pinned_by: string;
  pinned_at: string;
  updated_by: string | null;
  updated_at: string | null;
};

type TurbineRow = {
  code: string;
  pinned: boolean;
};

type RejectionRow = {
  id: number;
  turbine_code: string;
  yaw_err_deg: number | null;
  reason: string;
  attempted_by: string;
  attempted_at: string;
};

type Session = {
  token: string;
  username: string;
  role: string;
};

type View = "overview" | "pins";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      background: #0b1220;
      border-bottom: 1px solid #334155;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .brand {
      font-size: 1.15rem;
      font-weight: 700;
      color: #38bdf8;
      margin-right: 0.5rem;
      white-space: nowrap;
    }
    .nav {
      display: flex;
      gap: 0.5rem;
      flex: 1;
    }
    .nav button {
      background: transparent;
      color: #cbd5e1;
      border: 1px solid transparent;
      padding: 0.4rem 0.9rem;
    }
    .nav button.active {
      background: #164e63;
      color: #a5f3fc;
      border-color: #0e7490;
    }
    .who {
      color: #94a3b8;
      font-size: 0.85rem;
      white-space: nowrap;
    }
    main {
      padding: 1.25rem 1.5rem;
      max-width: 1180px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
      color: #38bdf8;
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.05rem;
      color: #e2e8f0;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1.25rem;
      font-size: 0.9rem;
    }
    section {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #334155;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: #cbd5e1;
      margin-bottom: 0.25rem;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #f1f5f9;
      margin-bottom: 0.75rem;
    }
    button {
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      background: #0284c7;
      color: #fff;
      font-weight: 600;
    }
    button.secondary {
      background: #475569;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th,
    td {
      text-align: left;
      padding: 0.5rem 0.4rem;
      border-bottom: 1px solid #334155;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
    }
    tbody tr.clickable {
      cursor: pointer;
    }
    tbody tr.clickable:hover {
      background: #243349;
    }
    .tag {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .ok {
      background: #14532d;
      color: #86efac;
    }
    .bad {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .pending {
      background: #713f12;
      color: #fde68a;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .muted {
      color: #64748b;
      font-size: 0.85rem;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .detail-row td {
      background: #16233b;
      padding: 0.75rem 1rem;
    }
    .detail-grid {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      font-size: 0.88rem;
    }
    .detail-grid .k {
      color: #94a3b8;
      margin-right: 0.35rem;
    }
    .pin-zones {
      display: grid;
      grid-template-columns: 1fr 1.4fr 1fr;
      gap: 1rem;
      align-items: start;
    }
    @media (max-width: 1000px) {
      .pin-zones {
        grid-template-columns: 1fr;
      }
    }
    .zone {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.1rem;
      border: 1px solid #334155;
      margin-bottom: 1rem;
    }
    .zone h2 {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }
    .zone .count {
      font-size: 0.8rem;
      color: #64748b;
      font-weight: 400;
    }
    .pin-line {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 0.45rem 0;
      border-bottom: 1px solid #2b3a52;
    }
    .pin-line:last-child {
      border-bottom: none;
    }
    .pin-line .code {
      font-weight: 700;
      color: #e2e8f0;
      min-width: 3.2rem;
    }
    .pin-line input {
      margin-bottom: 0;
      width: 7rem;
      padding: 0.35rem 0.5rem;
    }
    .pin-line button {
      padding: 0.35rem 0.7rem;
      white-space: nowrap;
    }
    .pin-meta {
      color: #94a3b8;
      font-size: 0.8rem;
    }
    .rej {
      padding: 0.55rem 0;
      border-bottom: 1px solid #2b3a52;
      font-size: 0.85rem;
    }
    .rej:last-child {
      border-bottom: none;
    }
    .rej .reason {
      color: #fca5a5;
    }
    .az {
      color: #a5f3fc;
      font-weight: 700;
    }
  `;

  @state() private session: Session | null = null;
  @state() private view: View = "overview";
  @state() private logs: LogRow[] = [];
  @state() private pins: PinRow[] = [];
  @state() private turbines: TurbineRow[] = [];
  @state() private rejections: RejectionRow[] = [];
  @state() private expandedLogId: number | null = null;
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private pinAzimuth: Record<string, string> = {};
  @state() private editAzimuth: Record<string, string> = {};
  @state() private error = "";
  @state() private pinError = "";
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    const raw = localStorage.getItem("yaw_session");
    if (raw) {
      try {
        this.session = JSON.parse(raw) as Session;
        void this.refreshAll();
        this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
      } catch {
        localStorage.removeItem("yaw_session");
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
    }
  }

  private _pollTimer?: number;

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async fetchJson(path: string): Promise<unknown | null> {
    try {
      const res = await fetch(path, { headers: this.authHeaders() });
      if (res.status === 401) {
        this.logout();
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async refreshAll() {
    if (!this.session) return;
    const [logs, pins, turbines, rejections] = await Promise.all([
      this.fetchJson("/api/logs"),
      this.fetchJson("/api/pins"),
      this.fetchJson("/api/turbines"),
      this.fetchJson("/api/rejections"),
    ]);
    if (logs) this.logs = logs as LogRow[];
    if (pins) this.pins = pins as PinRow[];
    if (turbines) this.turbines = turbines as TurbineRow[];
    if (rejections) this.rejections = rejections as RejectionRow[];
  }

  private async login() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.loginUser,
          password: this.loginPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "登录失败";
        return;
      }
      this.session = {
        token: data.access_token,
        username: data.username,
        role: data.role,
      };
      localStorage.setItem("yaw_session", JSON.stringify(this.session));
      await this.refreshAll();
      this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
    } catch {
      this.error = "无法连接接口";
    } finally {
      this.loading = false;
    }
  }

  private logout() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.session = null;
    this.logs = [];
    this.pins = [];
    this.turbines = [];
    this.rejections = [];
    this.expandedLogId = null;
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private async submitLog() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: this.turbineCode,
          yaw_err_deg: Number(this.yawErr),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "提交失败";
        await this.refreshAll();
        return;
      }
      this.turbineCode = "";
      this.yawErr = "";
      await this.refreshAll();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private async pinTurbine(code: string) {
    this.pinError = "";
    const azimuth = this.pinAzimuth[code] ?? "";
    try {
      const res = await fetch("/api/pins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: code,
          azimuth_deg: Number(azimuth),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.pinError = data.detail || "钉死失败";
        await this.refreshAll();
        return;
      }
      const next = { ...this.pinAzimuth };
      delete next[code];
      this.pinAzimuth = next;
      await this.refreshAll();
    } catch {
      this.pinError = "钉死时网络异常";
    }
  }

  private async repinTurbine(code: string) {
    this.pinError = "";
    const azimuth = this.editAzimuth[code] ?? "";
    try {
      const res = await fetch(`/api/pins/${encodeURIComponent(code)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({ azimuth_deg: Number(azimuth) }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.pinError = data.detail || "改数失败";
        return;
      }
      const next = { ...this.editAzimuth };
      delete next[code];
      this.editAzimuth = next;
      await this.refreshAll();
    } catch {
      this.pinError = "改数时网络异常";
    }
  }

  private verdictClass(row: LogRow) {
    if (row.status === "pending") return "pending";
    if (row.verdict === "合格") return "ok";
    if (row.verdict === "偏航超差") return "bad";
    return "";
  }

  private fmtTime(value: string | null) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }

  private renderLogin() {
    return html`
      <main>
        <h1>风机偏航对中台</h1>
        <p class="sub">
          报送偏航前须先在「机舱方位钉死台」把机组方位钉死，未钉机组整单退回。
        </p>
        <section>
          <label>用户名</label>
          <input
            .value=${this.loginUser}
            @input=${(e: Event) =>
              (this.loginUser = (e.target as HTMLInputElement).value)}
          />
          <label>密码</label>
          <input
            type="password"
            .value=${this.loginPass}
            @input=${(e: Event) =>
              (this.loginPass = (e.target as HTMLInputElement).value)}
          />
          <button ?disabled=${this.loading} @click=${this.login}>登录</button>
          ${this.error ? html`<p class="err">${this.error}</p>` : null}
        </section>
      </main>
    `;
  }

  private renderTopbar() {
    return html`
      <div class="topbar">
        <span class="brand">风机偏航对中台</span>
        <nav class="nav">
          <button
            class=${this.view === "overview" ? "active" : ""}
            @click=${() => (this.view = "overview")}
          >
            总览
          </button>
          <button
            class=${this.view === "pins" ? "active" : ""}
            @click=${() => (this.view = "pins")}
          >
            机舱方位钉死台
          </button>
        </nav>
        <span class="who">
          ${this.session?.username}
          (${this.isWriter ? "现场技师" : "观察员·只读"})
        </span>
        <button class="secondary" @click=${this.logout}>退出</button>
      </div>
    `;
  }

  private renderOverview() {
    return html`
      ${this.isWriter
        ? html`
            <section>
              <h2>提交偏航记录</h2>
              <p class="muted" style="margin-top:-0.35rem;">
                仅已钉死机组可入队；未钉机组整单退回并记入退回说明。
              </p>
              <label>机组编号</label>
              <input
                placeholder="例如 W01"
                .value=${this.turbineCode}
                @input=${(e: Event) =>
                  (this.turbineCode = (e.target as HTMLInputElement).value)}
              />
              <label>偏航误差（度，可正可负）</label>
              <input
                type="number"
                step="0.1"
                .value=${this.yawErr}
                @input=${(e: Event) =>
                  (this.yawErr = (e.target as HTMLInputElement).value)}
              />
              <button ?disabled=${this.loading} @click=${this.submitLog}>
                提交（进入待认领队列）
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
            </section>
          `
        : null}

      <section>
        <h2>对中记录</h2>
        <p class="muted" style="margin-top:-0.35rem;">
          点击行展开单据详情（含钉死方位快照）。
        </p>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>状态</th>
              <th>结论</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${this.logs.map((row) => this.renderLogRow(row))}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderLogRow(row: LogRow) {
    const expanded = this.expandedLogId === row.id;
    return html`
      <tr
        class="clickable"
        @click=${() => (this.expandedLogId = expanded ? null : row.id)}
      >
        <td>${expanded ? "▾" : "▸"} ${row.id}</td>
        <td>${row.turbine_code}</td>
        <td>${row.yaw_err_deg}</td>
        <td>
          <span class="tag ${row.status === "pending" ? "pending" : "ok"}">
            ${row.status === "pending" ? "待处理" : "已完成"}
          </span>
        </td>
        <td>
          ${row.verdict
            ? html`<span class="tag ${this.verdictClass(row)}">${row.verdict}</span>`
            : "—"}
        </td>
        <td>${row.reason ?? "—"}</td>
      </tr>
      ${expanded
        ? html`
            <tr class="detail-row">
              <td colspan="6">
                <div class="detail-grid">
                  <span>
                    <span class="k">钉死方位</span>
                    ${row.azimuth_deg === null
                      ? html`<span class="muted">—（钉死台账上线前历史单）</span>`
                      : html`<span class="az">${row.azimuth_deg}°</span>`}
                  </span>
                  <span><span class="k">提交人</span>${row.created_by}</span>
                  <span><span class="k">提交时间</span>${this.fmtTime(row.created_at)}</span>
                  <span><span class="k">处理时间</span>${this.fmtTime(row.processed_at)}</span>
                </div>
              </td>
            </tr>
          `
        : null}
    `;
  }

  private renderPins() {
    const pending = this.turbines.filter((t) => !t.pinned);
    return html`
      <div class="pin-zones">
        <div class="zone">
          <h2>待钉机组 <span class="count">${pending.length} 台</span></h2>
          ${pending.length === 0
            ? html`<p class="muted">全部机组均已钉死。</p>`
            : pending.map(
                (t) => html`
                  <div class="pin-line">
                    <span class="code">${t.code}</span>
                    ${this.isWriter
                      ? html`
                          <input
                            type="number"
                            step="0.1"
                            placeholder="方位角°"
                            .value=${this.pinAzimuth[t.code] ?? ""}
                            @input=${(e: Event) =>
                              (this.pinAzimuth = {
                                ...this.pinAzimuth,
                                [t.code]: (e.target as HTMLInputElement).value,
                              })}
                          />
                          <button @click=${() => this.pinTurbine(t.code)}>
                            钉死
                          </button>
                        `
                      : html`<span class="pin-meta">未钉</span>`}
                  </div>
                `
              )}
        </div>

        <div class="zone">
          <h2>已钉档案 <span class="count">${this.pins.length} 台</span></h2>
          ${this.pins.length === 0
            ? html`<p class="muted">暂无钉死记录。</p>`
            : this.pins.map(
                (p) => html`
                  <div class="pin-line">
                    <span class="code">${p.turbine_code}</span>
                    <span class="az">${p.azimuth_deg}°</span>
                    ${this.isWriter
                      ? html`
                          <input
                            type="number"
                            step="0.1"
                            placeholder="改数°"
                            .value=${this.editAzimuth[p.turbine_code] ?? ""}
                            @input=${(e: Event) =>
                              (this.editAzimuth = {
                                ...this.editAzimuth,
                                [p.turbine_code]: (e.target as HTMLInputElement).value,
                              })}
                          />
                          <button
                            class="secondary"
                            @click=${() => this.repinTurbine(p.turbine_code)}
                          >
                            改数
                          </button>
                        `
                      : null}
                  </div>
                  <div class="pin-meta">
                    ${p.pinned_by} 钉于 ${this.fmtTime(p.pinned_at)}
                    ${p.updated_at
                      ? html`；${p.updated_by} 改于 ${this.fmtTime(p.updated_at)}`
                      : null}
                  </div>
                `
              )}
        </div>

        <div class="zone">
          <h2>退回说明 <span class="count">${this.rejections.length} 条</span></h2>
          ${this.rejections.length === 0
            ? html`<p class="muted">暂无退回。</p>`
            : this.rejections.map(
                (r) => html`
                  <div class="rej">
                    <div>
                      <strong>${r.turbine_code}</strong>
                      ${r.yaw_err_deg === null ? "" : html`（误差 ${r.yaw_err_deg}°）`}
                      <span class="reason">${r.reason}</span>
                    </div>
                    <div class="pin-meta">
                      ${r.attempted_by} · ${this.fmtTime(r.attempted_at)}
                    </div>
                  </div>
                `
              )}
        </div>
      </div>
      ${this.pinError ? html`<p class="err">${this.pinError}</p>` : null}
    `;
  }

  render() {
    if (!this.session) {
      return this.renderLogin();
    }

    return html`
      ${this.renderTopbar()}
      <main>
        ${this.view === "overview" ? this.renderOverview() : this.renderPins()}
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}
