// lib/campaigns.ts
//
// The campaign an order funds, looked up on the server.
//
// Server-only, and deliberately its own module: it reads the shipped seed, and
// a seed import inside `lib/crowdfunding.ts` would follow that module into
// every client bundle that imports it — the page already carries validated
// projects across, so arriving at the browser a second time through a route
// would be a second copy of the same catalogue.
//
// Read per call rather than once at module load. A project's deadline derives
// from the day it is read (a stored date rots on the shelf), and a snapshot
// taken when this server started would freeze every closing date at that day —
// a campaign the page shows as open and the judge reads as shut.
import crowdfundingSeed from "@/lib/seeds/crowdfunding.json";
import { normaliseProjects, type Project } from "./crowdfunding.ts";

/**
 * The project with this id, or null when the catalogue holds none.
 *
 * An empty id answers null rather than the first project: an order that
 * announced a campaign and named no id must not be judged against *a* campaign
 * — it has to be refused for naming none that exists.
 */
export function findCampaign(id: string, today: Date = new Date()): Project | null {
  if (!id) return null;
  return normaliseProjects(crowdfundingSeed, today)?.find((entry) => entry.id === id) ?? null;
}
