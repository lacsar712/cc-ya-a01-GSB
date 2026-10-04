import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  turbine_code: string;
  yaw_err_deg: number;
  azimuth_deg: number;
  status: string;
  verdict: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type TurbineRow = {
  code: string;
  name: string;
  pinned: boolean;
  azimuth_deg: number | null;
  pinned_by: string | null;
  pinned_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

type Session = {
  token: string;
  username: string;
  role: string;
};

type Page = "overview" | "pinboard";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 1.5rem;
      max-width: 1100px;
      margin: 0 auto;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      border-bottom: 1px solid #334155;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      flex-wrap: wrap;
    }
    .topbar h1 {
      margin: 0;
      font-size: 1.35rem;
      color: #38bdf8;
    }
    .topbar nav {
      display: flex;
      gap: 0.5rem;
    }
    .topbar .spacer {
      flex: 1;
    }
    .who {
      color: #94a3b8;
      font-size: 0.85rem;
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
      color: #38bdf8;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }
    section,
    .panel {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #334155;
    }
    .board {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
      align-items: start;
    }
    @media (max-width: 900px) {
      .board {
        grid-template-columns: 1fr;
      }
    }
    .panel h2 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
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
    button.navbtn {
      background: transparent;
      border: 1px solid #475569;
      font-weight: 500;
    }
    button.navbtn.active {
      background: #0284c7;
      border-color: #0284c7;
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
      vertical-align: top;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
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
    .unpinned {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .pinned {
      background: #14532d;
      color: #86efac;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    ul.tight {
      margin: 0;
      padding-left: 1.1rem;
      font-size: 0.85rem;
      color: #cbd5e1;
    }
    ul.tight li {
      margin-bottom: 0.5rem;
    }
    .titem {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.4rem 0.1rem;
      border-bottom: 1px dashed #334155;
      font-size: 0.9rem;
      gap: 0.5rem;
    }
    .titem .meta {
      color: #94a3b8;
      font-size: 0.78rem;
    }
    .titem button {
      padding: 0.3rem 0.7rem;
      font-size: 0.8rem;
    }
    dialog {
      border: 1px solid #475569;
      border-radius: 8px;
      background: #1e293b;
      color: #e2e8f0;
      padding: 1.25rem 1.5rem;
      min-width: 320px;
      max-width: 90vw;
    }
    dialog::backdrop {
      background: rgba(2, 6, 23, 0.65);
    }
    dl.kv {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.4rem 1rem;
      margin: 0.75rem 0;
      font-size: 0.9rem;
    }
    dl.kv dt {
      color: #94a3b8;
    }
    dl.kv dd {
      margin: 0;
    }
  `;

  @state() private session: Session | null = null;
  @state() private page: Page = "overview";
  @state() private logs: LogRow[] = [];
  @state() private turbines: TurbineRow[] = [];
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private pinCode = "";
  @state() private pinAzimuthInput = "";
  @state() private editCode = "";
  @state() private editAzimuth = "";
  @state() private error = "";
  @state() private pinError = "";
  @state() private notice = "";
  @state() private loading = false;
  @state() private detailRow: LogRow | null = null;

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

  private async refreshAll() {
    await Promise.all([this.refreshLogs(), this.refreshTurbines()]);
  }

  private async refreshLogs() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/logs", { headers: this.authHeaders() });
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (!res.ok) return;
      this.logs = (await res.json()) as LogRow[];
    } catch {
      /* ignore transient network errors */
    }
  }

  private async refreshTurbines() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/turbines", { headers: this.authHeaders() });
      if (!res.ok) return;
      this.turbines = (await res.json()) as TurbineRow[];
    } catch {
      /* ignore transient network errors */
    }
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
    this.turbines = [];
    this.page = "overview";
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private goto(page: Page) {
    this.page = page;
    this.error = "";
    this.pinError = "";
    this.notice = "";
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
        // 未钉方位：整单退回并提示方位未钉
        this.error = data.detail || "提交失败，单据已退回";
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

  private fillPin(code: string) {
    this.pinCode = code;
    this.pinError = "";
  }

  private async pinAzimuth() {
    this.pinError = "";
    this.notice = "";
    const code = this.pinCode.trim();
    if (!code) {
      this.pinError = "请填写或选择机组编号";
      return;
    }
    if (this.pinAzimuthInput === "") {
      this.pinError = "请录入方位角";
      return;
    }
    try {
      const res = await fetch("/api/azimuth-pins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: code,
          azimuth_deg: Number(this.pinAzimuthInput),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.pinError = data.detail || "钉死失败";
        return;
      }
      this.pinCode = "";
      this.pinAzimuthInput = "";
      this.notice = `机组 ${data.turbine_code} 方位 ${data.azimuth_deg}° 已钉死`;
      await this.refreshTurbines();
    } catch {
      this.pinError = "钉死时网络异常";
    }
  }

  private startEdit(t: TurbineRow) {
    this.editCode = t.code;
    this.editAzimuth = String(t.azimuth_deg ?? "");
  }

  private cancelEdit() {
    this.editCode = "";
    this.editAzimuth = "";
  }

  private async saveEdit() {
    this.pinError = "";
    this.notice = "";
    try {
      const res = await fetch(`/api/azimuth-pins/${this.editCode}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({ azimuth_deg: Number(this.editAzimuth) }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.pinError = data.detail || "改钉失败";
        return;
      }
      this.notice = `机组 ${data.turbine_code} 台账现值已改为 ${data.azimuth_deg}°（历史单据方位不变）`;
      this.cancelEdit();
      await this.refreshTurbines();
    } catch {
      this.pinError = "改钉时网络异常";
    }
  }

  private openDetail(row: LogRow) {
    this.detailRow = row;
  }

  private closeDetail() {
    this.detailRow = null;
  }

  private fmtTime(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString("zh-CN", { hour12: false });
  }

  private verdictClass(row: LogRow) {
    if (row.status === "pending") return "pending";
    if (row.verdict === "合格") return "ok";
    if (row.verdict === "偏航超差") return "bad";
    return "";
  }

  private renderLogin() {
    return html`
      <h1>风机偏航对中台</h1>
      <p class="sub">现场技师先在钉死台钉死机舱方位，再提交偏航误差，后台 worker 给出结论。</p>
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
    `;
  }

  private renderTopbar() {
    return html`
      <div class="topbar">
        <h1>风机偏航对中台</h1>
        <nav>
          <button
            class="navbtn ${this.page === "overview" ? "active" : ""}"
            @click=${() => this.goto("overview")}
          >
            总览
          </button>
          <button
            class="navbtn ${this.page === "pinboard" ? "active" : ""}"
            @click=${() => this.goto("pinboard")}
          >
            机舱方位钉死台
          </button>
        </nav>
        <span class="spacer"></span>
        <span class="who">
          ${this.session!.username}（${this.isWriter ? "现场技师" : "观察员·只读"}）
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
              <h2 style="margin-top:0;font-size:1.1rem;">报送偏航入队</h2>
              <p class="sub" style="margin:0 0 0.75rem;font-size:0.85rem;">
                机组须先在「机舱方位钉死台」钉死方位；未钉机组的报送整单退回，不入队。
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
                报送（进入待处理队列）
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
            </section>
          `
        : null}

      <section>
        <div class="row-actions" style="margin-bottom:0.5rem;">
          <h2 style="margin:0;font-size:1.1rem;flex:1;">偏航单据</h2>
          <button class="secondary" ?disabled=${this.loading} @click=${this.refreshAll}>
            刷新
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>单号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>状态</th>
              <th>结论</th>
              <th>说明</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${this.logs.map(
              (row) => html`
                <tr>
                  <td>${row.id}</td>
                  <td>${row.turbine_code}</td>
                  <td>${row.yaw_err_deg}</td>
                  <td>
                    <span class="tag ${row.status === "pending" ? "pending" : "ok"}">
                      ${row.status === "pending" ? "待处理" : "已办结"}
                    </span>
                  </td>
                  <td>
                    ${row.verdict
                      ? html`<span class="tag ${this.verdictClass(row)}">${row.verdict}</span>`
                      : "—"}
                  </td>
                  <td>${row.reason ?? "—"}</td>
                  <td>
                    <button class="secondary" @click=${() => this.openDetail(row)}>
                      单据方位
                    </button>
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
        <p class="sub" style="margin:0.5rem 0 0;font-size:0.78rem;">
          注：方位角是入队当刻从钉死台账抄入单据的快照，不在总览尾列展示；点「单据方位」查看。
        </p>
      </section>

      <dialog ?open=${this.detailRow !== null}>
        ${this.detailRow
          ? html`
              <h2 style="margin:0;font-size:1.05rem;">
                单据 #${this.detailRow.id} 方位
              </h2>
              <dl class="kv">
                <dt>机组</dt>
                <dd>${this.detailRow.turbine_code}</dd>
                <dt>机舱方位</dt>
                <dd><strong>${this.detailRow.azimuth_deg}°</strong></dd>
                <dt>偏航误差</dt>
                <dd>${this.detailRow.yaw_err_deg}°</dd>
                <dt>状态</dt>
                <dd>
                  ${this.detailRow.status === "pending" ? "待处理" : "已办结"}
                </dd>
                <dt>报送人</dt>
                <dd>${this.detailRow.created_by}</dd>
                <dt>报送时间</dt>
                <dd>${this.fmtTime(this.detailRow.created_at)}</dd>
                <dt>办结时间</dt>
                <dd>${this.fmtTime(this.detailRow.processed_at)}</dd>
              </dl>
              <p class="sub" style="margin:0;font-size:0.78rem;">
                此方位为入队当刻抄录的快照，台账改钉不影响本单。
              </p>
              <div class="row-actions" style="margin-top:0.75rem;justify-content:flex-end;">
                <button class="secondary" @click=${this.closeDetail}>关闭</button>
              </div>
            `
          : null}
      </dialog>
    `;
  }

  private renderPinboard() {
    const unpinned = this.turbines.filter((t) => !t.pinned);
    const pinned = this.turbines.filter((t) => t.pinned);
    return html`
      <div class="board">
        <div class="panel">
          <h2>左区 · 待钉机组</h2>
          ${unpinned.length === 0
            ? html`<p class="sub" style="margin:0;font-size:0.85rem;">名册内机组均已钉死。</p>`
            : unpinned.map(
                (t) => html`
                  <div class="titem">
                    <div>
                      <div>${t.code} ${t.name}</div>
                      <span class="tag unpinned">未钉</span>
                    </div>
                    ${this.isWriter
                      ? html`<button @click=${() => this.fillPin(t.code)}>录入</button>`
                      : null}
                  </div>
                `
              )}
          ${this.isWriter
            ? html`
                <hr style="border-color:#334155;margin:0.75rem 0;" />
                <label>机组编号</label>
                <input
                  placeholder="例如 W01"
                  .value=${this.pinCode}
                  @input=${(e: Event) =>
                    (this.pinCode = (e.target as HTMLInputElement).value)}
                />
                <label>机舱方位角（度，0 ≤ 角 < 360）</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="360"
                  placeholder="例如 0.2"
                  .value=${this.pinAzimuthInput}
                  @input=${(e: Event) =>
                    (this.pinAzimuthInput = (e.target as HTMLInputElement).value)}
                />
                <button @click=${this.pinAzimuth}>执行钉死</button>
              `
            : html`<p class="sub" style="margin:0.5rem 0 0;font-size:0.8rem;">观察员无权钉死。</p>`}
          ${this.pinError ? html`<p class="err">${this.pinError}</p>` : null}
        </div>

        <div class="panel">
          <h2>中区 · 已钉档案</h2>
          ${pinned.length === 0
            ? html`<p class="sub" style="margin:0;font-size:0.85rem;">暂无已钉档案。</p>`
            : pinned.map((t) =>
                this.editCode === t.code && this.isWriter
                  ? html`
                      <div class="titem" style="display:block;">
                        <div><strong>${t.code} ${t.name}</strong></div>
                        <label style="margin-top:0.4rem;">新方位角（度）</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="360"
                          .value=${this.editAzimuth}
                          @input=${(e: Event) =>
                            (this.editAzimuth = (e.target as HTMLInputElement).value)}
                        />
                        <div class="row-actions">
                          <button @click=${this.saveEdit}>保存改钉</button>
                          <button class="secondary" @click=${this.cancelEdit}>取消</button>
                        </div>
                      </div>
                    `
                  : html`
                      <div class="titem">
                        <div>
                          <div>
                            ${t.code} ${t.name}
                            <span class="tag pinned">${t.azimuth_deg}°</span>
                          </div>
                          <div class="meta">
                            钉死：${t.pinned_by} · ${this.fmtTime(t.pinned_at)}
                          </div>
                          ${t.updated_by
                            ? html`<div class="meta">
                                改钉：${t.updated_by} · ${this.fmtTime(t.updated_at)}
                              </div>`
                            : null}
                        </div>
                        ${this.isWriter
                          ? html`<button @click=${() => this.startEdit(t)}>改数</button>`
                          : null}
                      </div>
                    `
              )}
          ${this.notice ? html`<p class="ok" style="color:#86efac;font-size:0.85rem;margin:0.5rem 0 0;">${this.notice}</p>` : null}
        </div>

        <div class="panel">
          <h2>右区 · 退回说明</h2>
          <ul class="tight">
            <li>报送偏航入队前，机组必须先在本台钉死机舱方位。</li>
            <li>未钉机组的报送<strong>整单退回</strong>，队列不落任何记录，并提示「方位未钉」。</li>
            <li>钉死成功后，方位在入队当刻抄进当次单据；此后在本台<strong>改数不牵动旧单结论</strong>。</li>
            <li>同一机组并发钉死只许一笔落库，另一笔当场拒收，请刷新档案。</li>
            <li>方位角取值范围 0°（含）至 360°（不含）。</li>
            <li>观察员可翻阅本档案与单据方位，但不可钉死、改钉或报送。</li>
          </ul>
        </div>
      </div>
    `;
  }

  render() {
    if (!this.session) {
      return this.renderLogin();
    }

    return html`
      ${this.renderTopbar()}
      ${this.page === "overview" ? this.renderOverview() : this.renderPinboard()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}
