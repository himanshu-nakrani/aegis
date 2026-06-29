# Aegis Codebase Review & Issue List (Updated)

This document lists all identified security vulnerabilities, bugs, and design/performance issues in the updated Aegis codebase.

---

## 1. Security Vulnerabilities

### 🚨 CRITICAL: Arbitrary Code Execution / Sandbox Breakout in Code Node
* **File Location:** [code_sandbox.py](file:///Users/himanshu/Git/aegis/backend/app/services/code_sandbox.py#L90-L109)
* **Description:** The Python code sandbox blocks imports and attributes starting with `__`, but it passes the standard library `json` module directly to the `exec` namespace. The `json` module imports the standard `codecs` module, which contains references to the real `sys` and `builtins` modules. Because the attribute names `codecs`, `sys`, and `builtins` do not start with `__`, they bypass the `_SafetyVisitor`. A user can execute arbitrary shell commands on the host machine by writing:
  ```python
  sys = json.codecs.sys
  os = sys.modules["os"]
  os.system("any-shell-command")
  ```
* **Recommendation:** Do not expose the standard `json` module directly or wrap its functions so that internal attributes cannot be traversed, or implement a stricter AST whitelist checking the resolved modules/namespaces.

### 🚨 DNS Rebinding SSRF Bypass in HTTP Node
* **File Location:** [node_handlers.py](file:///Users/himanshu/Git/aegis/backend/app/services/node_handlers.py#L113-L115), [url_safety.py](file:///Users/himanshu/Git/aegis/backend/app/services/url_safety.py#L26-L60)
* **Description:** The HTTP Tool uses `validate_http_url(target_url)` to verify the URL hostname is not a private IP before triggering `client.request` using HTTPX. However, HTTPX performs its own DNS resolution. This introduces a Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding vulnerability: an attacker can configure a DNS record to resolve to a public IP during validation but resolve to a local/private IP (e.g. `127.0.0.1` or `169.254.169.254`) when the request executes, successfully bypassing SSRF mitigations.
* **Recommendation:** Implement a custom `httpx` HTTP Transport that resolves the host once and connects directly to the resolved IP address, or validates the IP address immediately before establishing the TCP connection socket.

### 🚨 Local Network / Internal Database SSRF in Postgres Integration
* **File Location:** [integrations.py](file:///Users/himanshu/Git/aegis/backend/app/services/integrations.py#L101-L129)
* **Description:** Unlike the HTTP Tool, the Postgres integration does not perform any URL or IP checks on `connection_url`. An attacker can specify a connection string targeting the host's localhost database (e.g. `postgresql://aegis:aegis@127.0.0.1:5432/aegis`), allowing them to read and write directly to the application database, execute administrative SQL commands, or scan the local subnet.
* **Recommendation:** Parse and validate the hostname in the connection URL using `validate_http_url` or similar IP resolution checks before initializing the SQLAlchemy database engine.

### 🚨 Read-Only Check Bypass in Postgres Integration
* **File Location:** [integrations.py](file:///Users/himanshu/Git/aegis/backend/app/services/integrations.py#L17), [integrations.py](file:///Users/himanshu/Git/aegis/backend/app/services/integrations.py#L112-L113)
* **Description:** The read-only check uses a simple regex: `_READ_ONLY_SQL = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)`. While this blocks queries starting with `INSERT`, `UPDATE`, or `DELETE`, it can be bypassed in PostgreSQL using Common Table Expressions (CTEs). A query like `WITH payload AS (DELETE FROM users RETURNING *) SELECT 1;` starts with `WITH` and ends with a `SELECT`, satisfying the regex, but still modifies database records.
* **Recommendation:** Run queries within a read-only database transaction (`SET TRANSACTION READ ONLY`) or restrict the PostgreSQL user privileges used for execution to read-only roles.

### 🚨 Event Loop Blocking in Email Integration
* **File Location:** [integrations.py](file:///Users/himanshu/Git/aegis/backend/app/services/integrations.py#L87-L91)
* **Description:** The `run_email_integration` function runs a synchronous `smtplib.SMTP` block directly on the main event loop thread without `asyncio.to_thread`. If the SMTP server hangs, it freezes the entire FastAPI application worker for the duration of the SMTP connection timeout (up to 15 seconds).
* **Recommendation:** Wrap the entire synchronous SMTP delivery block in `await asyncio.to_thread()`.

---

## 2. Functional Bugs

### 🐛 Approval Decision Race Condition / Hang
* **File Location:** [approval_service.py](file:///Users/himanshu/Git/aegis/backend/app/services/approval_service.py#L30-L47)
* **Description:** If a user submits an approval decision (POST `/api/runs/{run_id}/approve`) before the running workflow task has reached the Human Approval node (i.e., before `wait_for_approval` starts), the event is not created yet, so `event.set()` is not called. When the run eventually hits the approval node and calls `wait_for_approval`, it starts waiting on a fresh event. The event will never be set, causing the run to hang until it times out, even though the approval decision was already submitted.
* **Recommendation:** Check if a result already exists in `_approval_results` at the start of `wait_for_approval` and return it immediately if present.

### 🐛 Sub-workflow Infinite Recursion / Circular Dependency Crash
* **File Location:** [sub_workflow.py](file:///Users/himanshu/Git/aegis/backend/app/services/sub_workflow.py#L20-L80)
* **Description:** The sub-workflow execution logic calls the child workflow compiler and runner without keeping track of the call stack depth or visited workflows. If Workflow A calls Workflow B and Workflow B calls Workflow A, it triggers infinite recursion, exhausting database connections and thread resources until the server crashes.
* **Recommendation:** Implement a call stack depth limit or detect circular dependencies in workflow versions before execution.

---

## 3. Performance & Scalability Concerns

### ⚙️ Database Query Scaling Bottleneck in Scheduler
* **File Location:** [schedule_worker.py](file:///Users/himanshu/Git/aegis/backend/app/services/schedule_worker.py#L55-L89)
* **Description:** The background schedule worker ticks every 15 seconds (by default) and calls `_scan_scheduled_workflows()`. This function queries `db.query(models.Workflow)` and eager-loads all versions of every single workflow in the database, validating their graphs and cron schedules in Python. On a production system with thousands of workflows and versions, this will exhaust DB connections, block execution threads, and cause high database CPU load.
* **Recommendation:** Store active schedules in a dedicated index or lookup table, or query only workflows containing schedule triggers by checking schema values directly in the SQL query.
