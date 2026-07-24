import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { normalizeLocationNames } from "@/lib/location-data";

const locationApiBase = "https://countriesnow.space/api/v0.1";
const locationCacheSeconds = 60 * 60 * 24;

type LocationApiResponse<T> = {
  data?: T;
  error?: boolean;
  msg?: string;
};

type CountryLocation = {
  name?: string;
};

async function fetchLocationData<T>(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${locationApiBase}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Location service responded with ${response.status}.`);
    }

    const payload = (await response.json()) as LocationApiResponse<T>;
    if (payload.error) {
      throw new Error(payload.msg || "Location service could not load this list.");
    }

    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

const loadCountries = unstable_cache(
  async () => {
    const countries = await fetchLocationData<CountryLocation[]>("/countries/positions");
    return normalizeLocationNames(countries?.map((country) => country.name));
  },
  ["owner-location-countries-v1"],
  { revalidate: locationCacheSeconds }
);

const loadCities = unstable_cache(
  async (country: string) => {
    const cities = await fetchLocationData<string[]>("/countries/cities", {
      body: JSON.stringify({ country }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    return normalizeLocationNames(cities);
  },
  ["owner-location-cities-v1"],
  { revalidate: locationCacheSeconds }
);

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.trim() ?? "";

  if (country.length > 100) {
    return NextResponse.json(
      { locations: [], message: "Country name is too long." },
      { status: 400 }
    );
  }

  try {
    const locations = country ? await loadCities(country) : await loadCountries();

    return NextResponse.json({
      locations,
      source: "countriesnow"
    });
  } catch (error) {
    return NextResponse.json(
      {
        locations: [],
        message: error instanceof Error ? error.message : "Unable to load locations."
      },
      { status: 502 }
    );
  }
}
