# Google Flights search through SerpApi

| Metadata | Value |
| --- | --- |
| Status | Implemented, configuration required |
| Purpose | Convert a typed travel intent into short-lived flight offer candidates |
| External API | SerpApi Google Flights engine |
| Primary code | [`backend/src/modules/vuelaya/google-flights.ts`](../../backend/src/modules/vuelaya/google-flights.ts) |

[Open the flight-search sequence](../diagrams/google-flights-search-sequence.html).

## What this integration is

The backend does not call a first-party Google Flights developer API. `GoogleFlightsSearchProvider` calls SerpApi's `google_flights` engine over HTTPS and validates the returned Google Flights-shaped JSON before it enters the product. SerpApi documents the endpoint, passenger, price, class, locale, sorting, and `deep_search` parameters in its [Google Flights API reference](https://serpapi.com/google-flights-api).

The integration is a discovery source, not a payment or authorization source. It can suggest an `OfferCandidate`; only VuelaYa can turn the selected, remembered offer into merchant-authored checkout terms, and only Bound Verify can reserve authority for that exact checkout.

## End-to-end path

1. TravelBot completes a typed `TravelIntent`: origin, destination, departure date, passengers, cabin, currency, and maximum total budget.
2. `VuelaYaCatalog` derives a stable cache key from those fields and deduplicates an identical in-flight request.
3. `GoogleFlightsSearchProvider` maps the intent to a one-way SerpApi request with Brazilian locale, the requested currency and cabin, top-flight sorting, and an optional deep search.
4. The provider validates the response with Zod, combines `best_flights` and `other_flights`, and keeps at most five results.
5. Each result becomes a typed `OfferCandidate` with integer minor units, route and segment metadata, local wall times, source URL, observation time, ranking, and a deterministic fingerprint-based ID.
6. The catalog caches the search result for five minutes and remembers the offers for checkout lookup. The offer itself expires after fifteen minutes.
7. TravelBot filters against route, date, cabin, currency, and total party budget before choosing the preferred offer deterministically.
8. On selection, VuelaYa recomputes quantity and total and signs a new checkout. The SerpApi payload is never accepted as proof of user authority.

## Request mapping

| Travel intent | SerpApi parameter | Current behavior |
| --- | --- | --- |
| `origin_iata` | `departure_id` | Uppercase IATA code |
| `destination_iata` | `arrival_id` | Uppercase IATA code |
| `departure_date` | `outbound_date` | Exact date, or earliest date with results when the intent contains only a month |
| `cabin` | `travel_class` | Economy `1`, premium economy `2`, business `3`, first `4` |
| `passenger_count` | budget calculation | Converts the total budget to a maximum per-ticket price |
| `max_total_budget.currency` | `currency` | Requested ISO currency |
| per-ticket budget | `max_price` | Floored major-unit ceiling |
| fixed product locale | `gl`, `hl` | `br`, `pt` |

`type=2` limits the implementation to one-way searches. `sort_by=1` requests top flights. `GOOGLE_FLIGHTS_DEEP_SEARCH=true` adds `deep_search=true`, which SerpApi describes as closer to the browser result but slower.

## Flexible-month searches

An exact `YYYY-MM-DD` intent performs one provider request. A `YYYY-MM` intent starts with the first future date in the month. If no results exist, it checks later dates in ordered batches of three and returns the first date with offers. This favors earliest availability and limits speculative calls, but a month with no results can still consume many external requests.

## Cache and failure behavior

- The search cache and remembered offers are process-local memory, not PostgreSQL.
- Identical concurrent searches share one provider promise.
- Search entries are capped at 100; remembered offers currently have no eviction cap.
- A missing `SERPAPI_API_KEY` installs `UnavailableFlightSearchProvider` and returns a sanitized `503` rather than fixture data.
- Network failures, timeouts, rate limits, provider 5xx responses, malformed JSON, and unexpected provider errors fail closed as a sanitized unavailable response.
- An explicit provider “no flights/results” message becomes an empty offer list.

## Important pricing boundary

The provider currently searches with `adults=1`, treats the returned price as a unit price, and multiplies it by `passenger_count` when VuelaYa creates the checkout. That keeps integer unit economics simple, but it is not a party-size quote: availability and fare buckets for multiple travelers can differ. This is a known correctness gap for searches with more than one passenger.

## Configuration

`SERPAPI_API_KEY` enables live search. `FLIGHT_SEARCH_TIMEOUT_MS` controls the request timeout, and `GOOGLE_FLIGHTS_DEEP_SEARCH` selects the slower, more complete provider mode. See [`backend/.env.example`](../../backend/.env.example).
