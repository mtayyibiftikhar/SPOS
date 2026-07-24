export function normalizeLocationNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const locations = new Map<string, string>();

  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }

    const name = entry.trim();
    if (!name) {
      return;
    }

    const normalizedName = name.toLocaleLowerCase("en");
    if (!locations.has(normalizedName)) {
      locations.set(normalizedName, name);
    }
  });

  return [...locations.values()].sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" })
  );
}
