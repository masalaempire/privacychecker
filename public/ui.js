const unavailable = "Unavailable";
export const element = (id) => document.getElementById(id);
export const show = (id, value) => { element(id).textContent = value ?? unavailable; };

export function rows(id, values) {
  const items = values.map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value ?? unavailable;
    row.append(term, detail);
    return row;
  });
  element(id).replaceChildren(...items);
}

export function list(id, values) {
  const items = values.map((value) => {
    const item = document.createElement("li");
    item.textContent = value;
    return item;
  });
  element(id).replaceChildren(...items);
}

export function status(id, label, state = "") {
  const badge = element(id + "-status");
  badge.textContent = label;
  badge.dataset.state = state;
}

export async function api(path, payload) {
  const options = {
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  };
  if (payload !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch("/api/" + path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The request failed.");
  }
  return data;
}
