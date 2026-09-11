let csrfToken = "";
export function setCsrf(value) {
  csrfToken = value || "";
}
export async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    ...options.headers,
  };
  let res;
  try {
    res = await fetch("/api" + path, {
      credentials: "same-origin",
      ...options,
      headers,
      body:
        options.body && !(options.body instanceof FormData)
          ? JSON.stringify(options.body)
          : options.body,
    });
  } catch {
    throw new Error("Connection lost. Check your network, then try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/me")
      window.dispatchEvent(new Event("session-expired"));
    const error = new Error(
      data.error || "Something went wrong. Please try again.",
    );
    error.status = res.status;
    throw error;
  }
  return data;
}
export async function downloadActivity(query) {
  const response = await fetch("/api/transactions/export?" + query, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error);
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "move-towel-activity.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
