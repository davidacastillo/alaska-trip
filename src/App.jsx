import React, { useState, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Mountain, Plane, BedDouble, Car, Footprints, Ship, Bird, UtensilsCrossed,
  Shuffle, ClipboardList, CloudRain, Flame, MapPin, MessageCircle, X, Send,
  CheckCircle2, Circle, AlertTriangle, Compass, Wallet, Luggage, CalendarDays,
  LayoutDashboard, ListChecks, Map as MapIcon, Sparkles, Pencil, RotateCcw,
  ExternalLink, ChevronRight,
} from "lucide-react";

/* ================================================================
   ALASKA TRIP 2026 — PERSONAL TRIP COMMAND CENTER
   ----------------------------------------------------------------
   ARCHITECTURE
   - ONE source of truth: `items` array (every flight, hotel, drive,
     hike, tour, budget line, and comparison-board card is an item).
   - All views (dashboard, itinerary, bookings, budget, swipe board,
     map, weather list, intensity list) are DERIVED with useMemo.
   - Editing any item updates every view automatically.
   - Persistence: window.storage (Claude artifact key-value API).
     Swap for localStorage/DB when self-hosting — see saveTrip().
   ================================================================ */

const STORAGE_KEY = "alaska_trip_2026_v4"; // bumped so all browsers adopt the recovered baseline
const TRAVELERS = 2;

/* ---------- Category + status vocabularies ---------- */
const CATEGORIES = {
  Flight:   { color: "#3E7CB1", icon: Plane },
  Lodging:  { color: "#2D6A4F", icon: BedDouble },
  Drive:    { color: "#64748B", icon: Car },
  Hike:     { color: "#588157", icon: Footprints },
  Tour:     { color: "#0E7490", icon: Ship },
  Wildlife: { color: "#B45309", icon: Bird },
  Food:     { color: "#9D4E63", icon: UtensilsCrossed },
  Flexible: { color: "#7C6FA0", icon: Shuffle },
  Admin:    { color: "#6B7280", icon: ClipboardList },
};
const STATUSES = ["Idea", "Planned", "Need to Book", "Booked", "Confirmed", "Paid", "Backup", "Canceled"];
const PRIORITIES = ["Must Do", "Strong Maybe", "Optional", "Backup"];
const DECISIONS = ["Keep", "Maybe", "Backup", "Pass"];
const INTENSITIES = ["Low", "Medium", "High"];
const ROUTE_FITS = ["High", "Medium", "Low"];
const BUDGET_CATS = ["Flights", "Rental car", "Lodging", "Tours", "Food", "Gas", "Gear", "Parking/fees", "Optional"];
const BOOKED_SET = new Set(["Booked", "Confirmed", "Paid"]);

const DAYS = [
  { date: "2026-08-09", label: "Sun, Aug 9",  short: "Sun 9",  title: "Late arrival in Anchorage" },
  { date: "2026-08-10", label: "Mon, Aug 10", short: "Mon 10", title: "Hatcher Pass · Reed Lakes" },
  { date: "2026-08-11", label: "Tue, Aug 11", short: "Tue 11", title: "Knik helicopter · AWCC · to Seward" },
  { date: "2026-08-12", label: "Wed, Aug 12", short: "Wed 12", title: "Harding Icefield Trail" },
  { date: "2026-08-13", label: "Thu, Aug 13", short: "Thu 13", title: "Kenai Fjords boat · to Homer" },
  { date: "2026-08-14", label: "Fri, Aug 14", short: "Fri 14", title: "Homer day" },
  { date: "2026-08-15", label: "Sat, Aug 15", short: "Sat 15", title: "Return to Anchorage" },
  { date: "2026-08-16", label: "Sun, Aug 16", short: "Sun 16", title: "6:15 AM departure" },
];

/* ================================================================
   SAMPLE DATA — the single trip data model.
   Cost notes: tours use realistic 2026 estimates for 2 people;
   lodging amounts are PLACEHOLDERS (placeholder: true) — update
   them after booking. All costs are trip totals for 2 travelers.
   ================================================================ */
const DEFAULT_ITEMS = [
  /* Baseline updated from live app state (recovered via browser console). */
  { id: "fl-in", name: "Flight to Anchorage (ANC)", date: "2026-08-09", start: "2:05 pm", end: "11:32 pm",
    location: "Ted Stevens Anchorage Intl", area: "Anchorage", category: "Flight", budgetCat: "Flights",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 382, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "Lands 10:32 PM. Keep the night simple — placeholder fare, update with real total." },
  { id: "fl-out", name: "Flight Anchorage (ANC) → home", date: "2026-08-16", start: "06:15", end: "",
    location: "Ted Stevens Anchorage Intl", area: "Anchorage", category: "Flight", budgetCat: "Flights",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 205, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "6:15 AM departure — leave hotel by ~4:15 AM. Cost included in round-trip fare above." },
  { id: "car", name: "Rental car —  compact SUV (Hyundai Kona AWD)", date: "2026-08-09", start: "23:00", end: "",
    location: "ANC airport rental center", area: "", category: "Admin", budgetCat: "Rental car",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 1089, paid: false,
    link: "chase", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    board: { duration: "7 days", competes: "Tours-from-Anchorage packages", reason: "Whole route depends on having our own car" },
    notes: "Confirm counter is open at 10:32 PM arrival; otherwise pick up Monday morning and shuttle to hotel. ~$800 placeholder for 7 days." },
  { id: "lg-0809", name: "Americas Best Value Inn & Suites Anchorage Airport", date: "2026-08-09", start: "23:15", end: "",
    location: "Near ANC airport", area: "Anchorage", category: "Lodging", budgetCat: "Lodging",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 196, paid: false,
    link: "chase", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    board: { duration: "1 night", competes: "Downtown Anchorage hotels", reason: "10:32 PM arrival — closest bed wins" },
    notes: "Free airport shuttle preferred in case the rental counter is closed." },
  { id: "lg-0810", name: "Matanuska River Park- Primitive Site", date: "2026-08-10", start: "", end: "",
    location: "Palmer or Wasilla", area: "Mat-Su Valley", category: "Lodging", budgetCat: "Lodging",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 35, paid: false,
    link: "chase", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "30 min from Knik helicopter base for Tuesday morning. " },
  { id: "lg-0811", name: "Seward Municipal Campgrounds - night 1", date: "2026-08-11", start: "", end: "",
    location: "Seward", area: "Kenai Peninsula", category: "Lodging", budgetCat: "Lodging",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 25, paid: false,
    link: "https://www.campspot.com/park/seward-municipal-campgrounds?gad_source=1&gad_campaignid=23699680508&gbraid=0AAAAACgvzQFRUZ94MUVyE7rF5hOVfaYCw&gclid=Cj0KCQjwsMLSBhD9ARIsAIpUTDpVCgRi8kjKqKTo88QrlNIq9tOW-dUxORXQj9abqaKcFo98qY5QVOsaAty5EALw_wcB&location=Seward,%20AK&latitude=60.106729&longitude=-149.434364&adults=0&children=0&pets=0&maxPrice=65", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "22 min from Harding Icefield Trail" },
  { id: "lg-0812", name: "Seward Municipal Campgrounds - night 2", date: "2026-08-12", start: "", end: "",
    location: "Seward", area: "Kenai Peninsula", category: "Lodging", budgetCat: "Lodging",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 25, paid: false,
    link: "https://www.campspot.com/park/seward-municipal-campgrounds?gad_source=1&gad_campaignid=23699680508&gbraid=0AAAAACgvzQFRUZ94MUVyE7rF5hOVfaYCw&gclid=Cj0KCQjwsMLSBhD9ARIsAIpUTDpVCgRi8kjKqKTo88QrlNIq9tOW-dUxORXQj9abqaKcFo98qY5QVOsaAty5EALw_wcB&location=Seward,%20AK&latitude=60.106729&longitude=-149.434364&adults=0&children=0&pets=0&maxPrice=65", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "4 min from Boat Tour" },
  { id: "lg-0813", name: "Campsite in Homer, Alaska", date: "2026-08-13", start: "", end: "",
    location: "Homer", area: "Kenai Peninsula", category: "Lodging", budgetCat: "Lodging",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 51, paid: false,
    link: "https://www.airbnb.com/rooms/29164628?check_in=2026-08-13&check_out=2026-08-15&location=Homer%2C%20AK&search_mode=regular_search&source_impression_id=p3_1783720867_P3ifPP5TRUlhb9s4&previous_page_section_name=1001&federated_search_id=471edddb-5f12-449a-adf4-ffeeed72b2f2&guests=2&adults=2", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "further: \nhttps://www.campspot.com/kasilof-dock/site/24867?location=Homer,%20Alaska&latitude=59.644527&longitude=-151.546981&checkin=2026-07-13&checkout=2026-07-15&adults=2&children=0&pets=0&campsiteCategory=Tent%20Sites" },
  { id: "lg-0814", name: "Campsite in Homer, Alaska", date: "2026-08-14", start: "", end: "",
    location: "Homer (or partway back)", area: "Kenai Peninsula", category: "Lodging", budgetCat: "Lodging",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 51, paid: false,
    link: "https://www.airbnb.com/rooms/29164628?check_in=2026-08-13&check_out=2026-08-15&location=Homer%2C%20AK&search_mode=regular_search&source_impression_id=p3_1783720867_P3ifPP5TRUlhb9s4&previous_page_section_name=1001&federated_search_id=471edddb-5f12-449a-adf4-ffeeed72b2f2&guests=2&adults=2", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "Medium",
    notes: "Staying partway back (Soldotna/Cooper Landing) shortens Saturday's drive. Placeholder rate." },
  { id: "lg-0815", name: "Airport-area hotel — Anchorage (pre-flight)", date: "2026-08-15", start: "", end: "",
    location: "Near ANC airport", area: "Anchorage", category: "Lodging", budgetCat: "Lodging",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 180, placeholder: true, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    board: { duration: "1 night", competes: "—", reason: "6:15 AM flight makes this non-negotiable" },
    notes: "24-hr shuttle or ultra-close walk. Pack and confirm flight tonight." },
  { id: "adm-shop", name: "Groceries, snacks, fuel canisters, bear spray, last-minute gear", date: "2026-08-10", start: "08:00", end: "09:30",
    location: "Anchorage (REI / Fred Meyer)", area: "Anchorage", category: "Admin", budgetCat: "Gear",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 150, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "Bear spray can't fly home — buy here (~$45). Includes trail snacks for Reed Lakes + Harding." },
  { id: "dr-hatcher", name: "Drive Anchorage → Hatcher Pass", date: "2026-08-10", start: "09:30", end: "11:00",
    location: "Glenn Hwy → Fishhook Rd", area: "Mat-Su Valley", category: "Drive", budgetCat: "Gas",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "~65 mi, 1.5 hr. Last mile to Reed Lakes trailhead is rough gravel — AWD helps." },
  { id: "hk-reed", name: "Reed Lakes hike — Hatcher Pass", date: "2026-08-10", start: "11:00", end: "17:00",
    location: "Reed Lakes Trailhead, Archangel Rd", area: "Mat-Su Valley", category: "Hike", budgetCat: "Parking/fees",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 10, paid: false,
    link: "", conf: "", cancelBy: "", weather: true, intensity: "High", routeFit: "High",
    board: { duration: "~6 hr, 9 mi RT", competes: "Gold Mint Trail (easier alt)", reason: "Signature alpine day — boulder field + turquoise lakes" },
    notes: "9 mi RT, ~2,300 ft gain, boulder scramble mid-route. Start by 11 AM latest; dinner simple in Palmer. $5/car parking." },
  { id: "tr-knik", name: "Knik Glacier helicopter landing", date: "2026-08-11", start: "09:00", end: "11:00",
    location: "Knik River Lodge helipad", area: "Mat-Su Valley", category: "Tour", budgetCat: "Tours",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 1044, paid: false,
    link: "https://www.alaskahelicoptertours.com/glacier-tours/?gad_source=1&gad_campaignid=22259133825&gbraid=0AAAAACnHdzuyMuOUO03QcUSKXF3IHZpEJ&gclid=Cj0KCQjwsMLSBhD9ARIsAIpUTDp4KwmipvDfRQ0CSqX491BMbC0GOxEraJwMlArmrQQogl0qigfUklsaAp64EALw_wcB", conf: "", cancelBy: "", weather: true, intensity: "Low", routeFit: "High",
    board: { duration: "~2 hr (30 min on ice)", competes: "Knik kayak tour · Matanuska walk", reason: "Trip centerpiece — glacier landing beats all alternatives" },
    notes: "≈$650/pp × 2. Weather-dependent: if canceled, fall back to Matanuska Glacier walk (backup card). Book AM slot so AWCC can flex." },
  { id: "fd-knik", name: "Lunch after helicopter (Palmer)", date: "2026-08-11", start: "11:30", end: "12:30",
    location: "Palmer", area: "Mat-Su Valley", category: "Food", budgetCat: "Food",
    status: "Planned", priority: "Optional", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "Covered by daily food budget line." },
  { id: "wl-awcc", name: "Alaska Wildlife Conservation Center", date: "2026-08-11", start: "14:30", end: "16:00",
    location: "Portage (Mile 79 Seward Hwy)", area: "Turnagain Arm", category: "Wildlife", budgetCat: "Tours",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 40, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    board: { duration: "1–1.5 hr", competes: "—", reason: "On the way south, cheap, guaranteed wildlife" },
    notes: "≈$20/pp. FLEXIBLE anchor — slides later if the helicopter is weather-delayed. It's literally on the route to Seward." },
  { id: "dr-seward", name: "Drive AWCC → Seward", date: "2026-08-11", start: "16:00", end: "17:45",
    location: "Seward Hwy", area: "Kenai Peninsula", category: "Drive", budgetCat: "Gas",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "~90 mi from Portage, 1.75 hr. One of the most scenic drives of the trip." },
  { id: "hk-harding", name: "Harding Icefield Trail (full)", date: "2026-08-12", start: "07:30", end: "16:30",
    location: "Exit Glacier area, Kenai Fjords NP", area: "Seward", category: "Hike", budgetCat: "Parking/fees",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: true, intensity: "High", routeFit: "High",
    board: { duration: "8–9 hr, 8.2 mi RT", competes: "Exit Glacier overlook only (easy alt)", reason: "Biggest payoff hike of the trip" },
    notes: "8.2 mi RT, ~3,500 ft gain. Biggest physical day — start by 7:30, pack lunch, keep the evening easy. Free entry/parking." },
  { id: "tr-fjords", name: "Kenai Fjords NP boat tour (6 hr)", date: "2026-08-13", start: "11:30", end: "17:30",
    location: "Seward small boat harbor", area: "Seward", category: "Tour", budgetCat: "Tours",
    status: "Need to Book", priority: "Must Do", decision: "Keep", cost: 530.46, paid: false,
    link: "https://www.viator.com/tours/Seward/Kenai-Fjords-National-Park-and-Chiswell-Islands-Cruise/d4368-7166P2", conf: "", cancelBy: "", weather: true, intensity: "Low", routeFit: "High",
    board: { duration: "6 hr", competes: "Half-day resurrection bay cruise", reason: "Tidewater glaciers + whales — the 6-hr version reaches the good stuff" },
    notes: "≈$200/pp × 2. Take motion-sickness meds 1 hr before. Recovery day after Harding." },
  { id: "dr-homer", name: "Drive Seward → Homer", date: "2026-08-13", start: "15:00", end: "18:30",
    location: "Sterling Hwy", area: "Kenai Peninsula", category: "Drive", budgetCat: "Gas",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "~170 mi, 3.5 hr. Scenic, low effort — good after the boat." },
  { id: "fx-homer", name: "Homer day — Spit, harbor, beach, seafood, coffee", date: "2026-08-14", start: "09:00", end: "18:00",
    location: "Homer Spit & town", area: "Homer", category: "Flexible", budgetCat: "Food",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    board: { duration: "Full day", competes: "Leaving a day earlier for Anchorage", reason: "The exhale day the trip needs" },
    notes: "Unstructured on purpose. Eagle-watching on the Spit, Two Sisters Bakery, Salty Dawg." },
  { id: "dr-anc", name: "Drive Homer → Anchorage", date: "2026-08-15", start: "10:00", end: "14:30",
    location: "Sterling + Seward Hwy", area: "Kenai Peninsula", category: "Drive", budgetCat: "Gas",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "~220 mi, 4.5 hr with stops. Leave slack — Turnagain Arm traffic on summer Saturdays." },
  { id: "adm-return", name: "Refuel + return rental car (or prep for 4 AM return)", date: "2026-08-15", start: "15:00", end: "16:00",
    location: "ANC airport", area: "Anchorage", category: "Admin", budgetCat: "Rental car",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "Returning tonight = simpler 4 AM. If keeping the car, confirm the return lot is open pre-5 AM." },
  { id: "adm-pack", name: "Pack, organize gear, confirm flight", date: "2026-08-15", start: "19:00", end: "21:00",
    location: "Airport hotel", area: "Anchorage", category: "Admin", budgetCat: "Parking/fees",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "Check in online, set two alarms, bear spray does NOT fly — gift it or leave with hotel." },
  { id: "bg-food", name: "Food & coffee (trip total)", date: null, start: "", end: "",
    location: "—", area: "Trip-wide", category: "Food", budgetCat: "Food",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 840, placeholder: true, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "≈$60/pp/day × 7 days × 2. Groceries Monday keeps this down." },
  { id: "bg-gas", name: "Gas (≈700 mi total)", date: null, start: "", end: "",
    location: "—", area: "Trip-wide", category: "Drive", budgetCat: "Gas",
    status: "Planned", priority: "Must Do", decision: "Keep", cost: 130, placeholder: true, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "High",
    notes: "Compact SUV, AK summer prices." },
  { id: "op-fish", name: "Homer 3/4 day halibut fishing", date: "2026-08-14", start: "6:30 am", end: "12:30 pm",
    location: "Homer harbor", area: "Homer", category: "Tour", budgetCat: "Optional",
    status: "Canceled", priority: "Strong Maybe", decision: "Pass", cost: 839.36, paid: false,
    link: "https://homerhalibuthunters.com/2026-availability/", conf: "", cancelBy: "", weather: true, intensity: "Medium", routeFit: "High",
    board: { duration: "5–6 hr", competes: "Relaxed Homer morning", reason: "Classic Homer, but eats half the only slow day (+$600 for 2)" },
    notes: "≈$300/pp half-day. Fish processing/shipping is extra. Decide by early August." },
  { id: "op-sled", name: "Dog sledding (summer cart ride)", date: null, start: "", end: "",
    location: "Seward or Girdwood", area: "Kenai Peninsula", category: "Tour", budgetCat: "Optional",
    status: "Canceled", priority: "Optional", decision: "Pass", cost: 180, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "Medium",
    board: { duration: "1.5 hr", competes: "Free time in Seward", reason: "Only if it slots in without moving anything (glacier heli-mush is ~$600/pp — skip that version)" },
    notes: "Seward-area kennels fit the route best (Aug 12 evening or Aug 13 pre-boat is too tight — realistically Aug 11 evening)." },
  { id: "bk-matanuska", name: "Matanuska Glacier guided walk (helicopter backup)", date: "2026-08-11", start: "09:00", end: "13:00",
    location: "Glacier Park, Glenn Hwy", area: "Mat-Su Valley", category: "Tour", budgetCat: "Optional",
    status: "Backup", priority: "Backup", decision: "Backup", cost: 260, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Medium", routeFit: "Medium",
    board: { duration: "3–4 hr + 2 hr extra driving", competes: "Knik helicopter", reason: "Only fires if weather cancels the helicopter" },
    notes: "≈$130/pp guided access. 1.5 hr NE of Palmer — doable same-day pivot, pushes AWCC to a quick evening stop." },
  { id: "bk-anc-tour", name: "Anchorage food / city tour (bad-weather backup)", date: null, start: "", end: "",
    location: "Downtown Anchorage", area: "Anchorage", category: "Food", budgetCat: "Optional",
    status: "Backup", priority: "Backup", decision: "Backup", cost: 190, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "Low",
    board: { duration: "3 hr", competes: "Any rained-out hike day", reason: "Pure contingency — only if a full day washes out" },
    notes: "≈$95/pp. Don't pre-book." },
  { id: "ps-denali", name: "Denali backpacking", date: null, start: "", end: "",
    location: "Denali NP", area: "Interior", category: "Hike", budgetCat: "Optional",
    status: "Canceled", priority: "Backup", decision: "Pass", cost: 0, paid: false,
    link: "", conf: "", cancelBy: "", weather: true, intensity: "High", routeFit: "Low",
    board: { duration: "2–3 days", competes: "Entire Kenai half of the trip", reason: "ANC round-trip flights make the 240-mi detour + permits unworkable in 7 days" },
    notes: "Cut when flights changed to Anchorage round trip. Save for a dedicated trip." },
  { id: "ps-sup", name: "Glacier paddleboarding", date: null, start: "", end: "",
    location: "Valdez / Whittier area", area: "Prince William Sound", category: "Tour", budgetCat: "Optional",
    status: "Canceled", priority: "Backup", decision: "Pass", cost: 800, paid: false,
    link: "", conf: "", cancelBy: "", weather: true, intensity: "Medium", routeFit: "Low",
    board: { duration: "Half day + big detour", competes: "Budget + schedule everywhere", reason: "≈$400/pp, crowds the schedule, off-route" },
    notes: "Cool, but wrong trip." },
  { id: "ps-knik-kayak", name: "Knik Glacier kayak tour", date: null, start: "", end: "",
    location: "Knik River", area: "Mat-Su Valley", category: "Tour", budgetCat: "Optional",
    status: "Canceled", priority: "Backup", decision: "Pass", cost: 500, paid: false,
    link: "", conf: "", cancelBy: "", weather: true, intensity: "Medium", routeFit: "High",
    board: { duration: "5 hr", competes: "Knik helicopter landing", reason: "Redundant with the helicopter — same glacier, more time, less wow" },
    notes: "Revisit only if we drop the helicopter entirely." },
  { id: "ps-anc-fish", name: "Anchorage full-day salmon fishing", date: null, start: "", end: "",
    location: "Ship Creek / Kenai R.", area: "Anchorage", category: "Tour", budgetCat: "Optional",
    status: "Canceled", priority: "Backup", decision: "Pass", cost: 700, paid: false,
    link: "", conf: "", cancelBy: "", weather: true, intensity: "Medium", routeFit: "Low",
    board: { duration: "Full day", competes: "Homer day", reason: "Only makes sense if Homer gets cut — it isn't" },
    notes: "" },
  { id: "ps-wild-tour", name: "Wildlife/wilderness bus tour from Anchorage", date: null, start: "", end: "",
    location: "Anchorage departures", area: "Anchorage", category: "Wildlife", budgetCat: "Optional",
    status: "Canceled", priority: "Backup", decision: "Pass", cost: 400, paid: false,
    link: "", conf: "", cancelBy: "", weather: false, intensity: "Low", routeFit: "Low",
    board: { duration: "Full day", competes: "Rental car freedom", reason: "We have a car — we ARE the wildlife tour" },
    notes: "" },
  { id: "ps-kayak-extra", name: "Extra full-day kayak tours", date: null, start: "", end: "",
    location: "Seward / Whittier", area: "Kenai Peninsula", category: "Tour", budgetCat: "Optional",
    status: "Canceled", priority: "Backup", decision: "Pass", cost: 600, paid: false,
    link: "", conf: "", cancelBy: "", weather: true, intensity: "High", routeFit: "Medium",
    board: { duration: "Full day each", competes: "Harding Icefield or Kenai Fjords", reason: "Would force cutting a must-do anchor" },
    notes: "" },
];

/* ---------- Packing list (checked state persists) ---------- */
const DEFAULT_PACKING = [
  { cat: "Hiking", items: ["Hiking shoes or boots (broken in)", "Daypack (20–30L)", "Water bottles / hydration bladder", "Extra socks (wool)", "Snacks for Reed Lakes", "Snacks + packed lunch for Harding Icefield", "Trekking poles (Harding descent)"] },
  { cat: "Rain", items: ["Rain jacket (real shell, not resistant)", "Waterproof / water-resistant hiking pants", "Pack rain cover or liner bag"] },
  { cat: "Cold weather", items: ["Fleece or warm mid-layer", "Beanie", "Gloves", "Warm layer for boat deck"] },
  { cat: "Boat tour", items: ["Motion sickness medicine (take 1 hr before)", "Binoculars", "Windproof outer layer"] },
  { cat: "Car", items: ["Offline maps downloaded (Google Maps AK areas)", "Phone mount", "Car snacks + water", "Printed rental car info"] },
  { cat: "Toiletries", items: ["Sunscreen", "Lip balm SPF", "Bug spray", "First-aid basics + blister kit"] },
  { cat: "Electronics", items: ["Portable charger (x2)", "Charging cables", "Camera + free phone storage", "Headlamp (late arrival)"] },
  { cat: "Documents", items: ["Confirmation documents (offline copies)", "Flight info", "ID / licenses (both drivers)", "Insurance cards"] },
  { cat: "Food/snacks", items: ["Trail mix / bars for both big hikes", "Electrolyte packets", "Buy in Anchorage: bear spray (can't fly home)", "Stove fuel if cooking (buy local)"] },
];

/* ================================================================
   PERSISTENCE — Claude artifact storage.
   To self-host later: replace these two helpers with localStorage
   or your own API. Everything else stays identical.
   ================================================================ */
async function loadTrip() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
async function saveTrip(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

/* ---------- small utils ---------- */
const money = (n) => "$" + Number(n || 0).toLocaleString();
const dayFor = (date) => DAYS.find((d) => d.date === date);
const inPlan = (it) => it.decision !== "Pass" && it.status !== "Canceled";
const needsBooking = (it) => ["Flights","Rental car","Lodging","Tours","Optional"].includes(it.budgetCat) && it.category !== "Food";

/* ================================================================
   APP
   ================================================================ */
export default function App() {
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [packing, setPacking] = useState(() =>
    DEFAULT_PACKING.map((g) => ({ ...g, items: g.items.map((t) => ({ text: t, done: false })) }))
  );
  const [tab, setTab] = useState("dashboard");
  const [itinView, setItinView] = useState("timeline");
  const [editing, setEditing] = useState(null); // item id being edited
  const [chatOpen, setChatOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  /* load once */
  useEffect(() => {
    (async () => {
      const s = await loadTrip();
      if (s) {
        if (s.items) setItems(s.items);
        if (s.packing) setPacking(s.packing);
      }
      setLoaded(true);
    })();
  }, []);

  /* debounced autosave */
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      await saveTrip({ items, packing });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }, 600);
    return () => clearTimeout(t);
  }, [items, packing, loaded]);

  /* ---------- SINGLE update path: every view reacts to this ---------- */
  const updateItem = (id, patch) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      // Decision side-effects (editing behavior spec §9):
      if (patch.decision === "Pass") next.status = "Canceled";                    // out of itinerary, stays on board
      if (patch.decision === "Keep" && it.decision !== "Keep") {
        if (next.status === "Canceled" || next.status === "Idea" || next.status === "Backup")
          next.status = needsBooking(next) ? "Need to Book" : "Planned";           // promoted → flagged for booking/review
      }
      if (patch.decision === "Maybe" && next.status === "Canceled") next.status = "Idea";
      if (patch.decision === "Backup") next.status = "Backup";
      if (patch.status === "Paid") next.paid = true;
      return next;
    }));
  };
  const resetAll = () => {
    if (!window.confirm("Reset the whole trip to the original sample data? Your edits will be lost.")) return;
    setItems(DEFAULT_ITEMS);
    setPacking(DEFAULT_PACKING.map((g) => ({ ...g, items: g.items.map((t) => ({ text: t, done: false })) })));
  };

  /* ================= DERIVED VIEWS (all from `items`) ================= */
  const derived = useMemo(() => {
    const active = items.filter(inPlan);
    const bookables = active.filter(needsBooking);
    const booked = bookables.filter((it) => BOOKED_SET.has(it.status));
    const toBook = bookables.filter((it) => !BOOKED_SET.has(it.status) && it.decision !== "Backup");

    const estTotal = active.filter((it) => it.decision !== "Backup" && it.decision !== "Maybe").reduce((s, it) => s + (it.cost || 0), 0);
    const maybeTotal = active.filter((it) => it.decision === "Maybe").reduce((s, it) => s + (it.cost || 0), 0);
    const paidTotal = active.filter((it) => it.paid).reduce((s, it) => s + (it.cost || 0), 0);

    const byBudget = {};
    BUDGET_CATS.forEach((c) => (byBudget[c] = { est: 0, paid: 0 }));
    active.forEach((it) => {
      if (it.decision === "Backup") return;
      const bucket = it.decision === "Maybe" ? "Optional" : it.budgetCat;
      byBudget[bucket].est += it.cost || 0;
      if (it.paid) byBudget[bucket].paid += it.cost || 0;
    });

    const weatherItems = active.filter((it) => it.weather && it.decision !== "Backup");
    const highDays = DAYS.filter((d) => active.some((it) => it.date === d.date && it.intensity === "High"));
    const maybes = items.filter((it) => it.decision === "Maybe");
    const boardCards = items.filter((it) => it.board || ["Maybe","Backup","Pass"].includes(it.decision));

    const byDay = DAYS.map((d) => ({
      ...d,
      items: active.filter((it) => it.date === d.date).sort((a, b) => (a.start || "99").localeCompare(b.start || "99")),
    }));

    return { active, bookables, booked, toBook, estTotal, maybeTotal, paidTotal, byBudget, weatherItems, highDays, maybes, boardCards, byDay };
  }, [items]);

  const editingItem = items.find((it) => it.id === editing);

  return (
    <div className="app">
      <StyleBlock />
      {/* ---------- Sidebar / bottom nav ---------- */}
      <nav className="nav">
        <div className="nav-brand">
          <Mountain size={22} strokeWidth={2.2} />
          <div className="nav-brand-text"><b>Alaska '26</b><span>Trip command center</span></div>
        </div>
        {[
          ["dashboard", "Dashboard", LayoutDashboard],
          ["itinerary", "Itinerary", CalendarDays],
          ["bookings", "Bookings", ListChecks],
          ["budget", "Budget", Wallet],
          ["board", "Swipe Board", Shuffle],
          ["packing", "Packing", Luggage],
          ["map", "Map", MapIcon],
        ].map(([id, label, Icon]) => (
          <button key={id} className={"nav-btn" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
        <button className={"nav-btn ai" + (chatOpen ? " on" : "")} onClick={() => setChatOpen(true)}>
          <Sparkles size={18} /><span>AI Assistant</span>
        </button>
        <div className="nav-foot">
          <button className="reset" onClick={resetAll}><RotateCcw size={13} /> Reset data</button>
          <span className={"saved" + (savedFlash ? " show" : "")}>Saved ✓</span>
        </div>
      </nav>

      {/* ---------- Main ---------- */}
      <main className="main">
        {tab === "dashboard" && <Dashboard d={derived} go={setTab} openChat={() => setChatOpen(true)} edit={setEditing} />}
        {tab === "itinerary" && <Itinerary d={derived} view={itinView} setView={setItinView} edit={setEditing} />}
        {tab === "bookings" && <Bookings d={derived} update={updateItem} edit={setEditing} />}
        {tab === "budget" && <Budget d={derived} />}
        {tab === "board" && <Board cards={derived.boardCards} update={updateItem} edit={setEditing} />}
        {tab === "packing" && <Packing packing={packing} setPacking={setPacking} />}
        {tab === "map" && <MapView />}
      </main>

      {/* ---------- Edit drawer + chat drawer ---------- */}
      {editingItem && <EditDrawer item={editingItem} update={updateItem} close={() => setEditing(null)} />}
      <Chat open={chatOpen} close={() => setChatOpen(false)} items={items} d={derived} />
      {!chatOpen && (
        <button className="fab" onClick={() => setChatOpen(true)} aria-label="Open Alaska Trip Assistant">
          <MessageCircle size={22} />
        </button>
      )}
    </div>
  );
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function Dashboard({ d, go, openChat, edit }) {
  const bookPct = d.bookables.length ? Math.round((d.booked.length / d.bookables.length) * 100) : 0;
  return (
    <div className="page">
      <header className="hero">
        <div className="hero-eyebrow">Anchorage round trip · {TRAVELERS} travelers</div>
        <h1>Alaska Trip 2026</h1>
        <div className="hero-sub">Sun Aug 9 → Sun Aug 16 · Arrive ANC <b>10:32 PM</b> · Depart ANC <b>6:15 AM</b></div>
        <div className="hero-route">ANC → Hatcher Pass → Knik Glacier → AWCC → Seward → Harding Icefield → Kenai Fjords → Homer → ANC</div>
        <Ridgeline days={d.byDay} />
      </header>

      <div className="stat-row">
        <div className="stat card">
          <div className="stat-label">Booking progress</div>
          <div className="stat-big">{d.booked.length}<span>/{d.bookables.length}</span></div>
          <div className="bar"><div className="bar-fill" style={{ width: bookPct + "%" }} /></div>
          <div className="stat-foot">{d.toBook.length} still to book</div>
        </div>
        <div className="stat card">
          <div className="stat-label">Estimated total</div>
          <div className="stat-big">{money(d.estTotal)}</div>
          <div className="stat-foot">{money(Math.round(d.estTotal / TRAVELERS))} / person · +{money(d.maybeTotal)} if all Maybes</div>
        </div>
        <div className="stat card">
          <div className="stat-label">Paid so far</div>
          <div className="stat-big">{money(d.paidTotal)}</div>
          <div className="stat-foot">{money(d.estTotal - d.paidTotal)} remaining unpaid</div>
        </div>
        <div className="stat card warn">
          <div className="stat-label">Decisions remaining</div>
          <div className="stat-big">{d.maybes.length}</div>
          <div className="stat-foot">{d.maybes.map((m) => m.name.split(" ")[0] + " " + (m.name.split(" ")[1] || "")).join(" · ") || "All decided"}</div>
        </div>
      </div>

      <div className="two-col">
        <section className="card">
          <h2><CloudRain size={16} /> Weather-dependent items</h2>
          {d.weatherItems.map((it) => (
            <button key={it.id} className="mini-row" onClick={() => edit(it.id)}>
              <CatDot cat={it.category} /><span className="mini-name">{it.name}</span>
              <span className="mini-meta">{dayFor(it.date)?.short || "—"}</span>
            </button>
          ))}
          <p className="hint">Helicopter backup: Matanuska Glacier walk. Boat tours refund on captain-canceled weather.</p>
        </section>
        <section className="card">
          <h2><Flame size={16} /> High-intensity days</h2>
          {d.highDays.map((day) => (
            <div key={day.date} className="mini-row static">
              <span className="pill high">HIGH</span><span className="mini-name">{day.label}</span>
              <span className="mini-meta">{day.title}</span>
            </div>
          ))}
          <p className="hint">Two big hike days with a recovery buffer between them. Keep the evenings after each one empty.</p>
        </section>
      </div>

      <section className="card">
        <h2><Compass size={16} /> Still to book</h2>
        {d.toBook.length === 0 ? <p className="hint">Everything's booked. Go pack.</p> :
          d.toBook.map((it) => (
            <button key={it.id} className="mini-row" onClick={() => edit(it.id)}>
              <CatDot cat={it.category} /><span className="mini-name">{it.name}</span>
              <span className="mini-meta">{it.cost ? money(it.cost) : ""} · {dayFor(it.date)?.short || "any"}</span>
              <ChevronRight size={14} />
            </button>
          ))}
      </section>

      <div className="quick-row">
        {[["itinerary","Itinerary",CalendarDays],["bookings","Bookings",ListChecks],["budget","Budget",Wallet],["packing","Packing",Luggage],["map","Map",MapIcon],["board","Swipe Board",Shuffle]].map(([id,l,Icon]) => (
          <button key={id} className="quick" onClick={() => go(id)}><Icon size={16} />{l}</button>
        ))}
        <button className="quick ai" onClick={openChat}><Sparkles size={16} />Ask the assistant</button>
      </div>
    </div>
  );
}

/* Signature element: ridgeline strip — day sequence drawn as an elevation
   profile; peak height encodes that day's max physical intensity. */
function Ridgeline({ days }) {
  const W = 720, H = 96, base = 78;
  const hFor = (d) => {
    const ints = d.items.map((i) => i.intensity);
    if (ints.includes("High")) return 14;
    if (ints.includes("Medium")) return 40;
    return 56;
  };
  const pts = days.map((d, i) => ({ x: 30 + (i * (W - 60)) / (days.length - 1), y: hFor(d), d }));
  const path = "M0," + base + " " + pts.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${W},${base}`;
  return (
    <svg className="ridge" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path + " Z"} fill="rgba(27,94,68,0.10)" />
      <path d={path} fill="none" stroke="#1B5E44" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill={p.y < 20 ? "#B23A5E" : "#1B5E44"} />
          <text x={p.x} y={H - 4} textAnchor="middle" className="ridge-t">{p.d.short}</text>
        </g>
      ))}
    </svg>
  );
}

/* ================================================================
   ITINERARY — multiple views from one dataset
   ================================================================ */
function Itinerary({ d, view, setView, edit }) {
  const views = [["timeline","Day by day"],["calendar","Calendar"],["weather","Weather risk"],["intensity","Intensity"],["locations","Locations"]];
  return (
    <div className="page">
      <PageHead title="Master Itinerary" sub="One dataset — five views. Tap any item to edit it everywhere at once." />
      <div className="seg">
        {views.map(([id, l]) => <button key={id} className={view === id ? "on" : ""} onClick={() => setView(id)}>{l}</button>)}
      </div>

      {view === "timeline" && d.byDay.map((day) => (
        <section key={day.date} className="card day">
          <div className="day-head">
            <div><b>{day.label}</b><span className="day-title">{day.title}</span></div>
            {day.items.some((i) => i.intensity === "High") && <span className="pill high">HIGH DAY</span>}
          </div>
          {day.items.map((it) => <ItemRow key={it.id} it={it} edit={edit} showTime />)}
        </section>
      ))}

      {view === "calendar" && (
        <div className="cal">
          {d.byDay.map((day) => (
            <div key={day.date} className="cal-col">
              <div className="cal-head">{day.short}</div>
              {day.items.map((it) => {
                const C = CATEGORIES[it.category];
                return (
                  <button key={it.id} className="cal-item" style={{ borderLeftColor: C.color }} onClick={() => edit(it.id)}>
                    <span className="cal-time">{it.start || "—"}</span>{it.name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === "weather" && (
        <section className="card">
          <h2><CloudRain size={16} /> Weather-dependent items</h2>
          {d.weatherItems.map((it) => <ItemRow key={it.id} it={it} edit={edit} showTime />)}
        </section>
      )}

      {view === "intensity" && (
        <section className="card">
          <h2><Flame size={16} /> By physical intensity</h2>
          {["High","Medium","Low"].map((lvl) => {
            const rows = d.active.filter((it) => it.intensity === lvl && it.category !== "Admin" && it.category !== "Lodging" && it.decision !== "Backup");
            return rows.length ? (
              <div key={lvl}>
                <div className="sub-h"><span className={"pill " + lvl.toLowerCase()}>{lvl.toUpperCase()}</span></div>
                {rows.map((it) => <ItemRow key={it.id} it={it} edit={edit} />)}
              </div>
            ) : null;
          })}
        </section>
      )}

      {view === "locations" && (
        <section className="card">
          <h2><MapPin size={16} /> By area</h2>
          {[...new Set(d.active.map((it) => it.area))].map((area) => (
            <div key={area}>
              <div className="sub-h"><b>{area}</b></div>
              {d.active.filter((it) => it.area === area).map((it) => <ItemRow key={it.id} it={it} edit={edit} />)}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ItemRow({ it, edit, showTime }) {
  const C = CATEGORIES[it.category]; const Icon = C.icon;
  return (
    <button className="item-row" onClick={() => edit(it.id)}>
      <span className="item-ic" style={{ background: C.color + "1A", color: C.color }}><Icon size={15} /></span>
      <span className="item-main">
        <span className="item-name">{it.name}</span>
        <span className="item-meta">
          {showTime && it.start ? it.start + (it.end ? "–" + it.end : "") + " · " : ""}
          {it.location !== "—" ? it.location : it.area}
          {it.cost ? " · " + money(it.cost) + (it.placeholder ? " est." : "") : ""}
        </span>
      </span>
      {it.weather && <CloudRain size={14} className="dim" title="Weather dependent" />}
      {it.intensity === "High" && <Flame size={14} className="hot" title="High intensity" />}
      <StatusPill status={it.status} />
      <Pencil size={13} className="dim" />
    </button>
  );
}

/* ================================================================
   BOOKINGS
   ================================================================ */
function Bookings({ d, update, edit }) {
  const rows = d.bookables.slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  return (
    <div className="page">
      <PageHead title="Booking Tracker" sub="Generated live from the itinerary. Change a status here and the dashboard, budget, and itinerary update instantly." />
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Type</th><th>Date</th><th>Status</th><th className="num">Cost</th><th>Paid</th><th>Conf #</th><th>Cancel by</th><th></th></tr></thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id} className={it.decision === "Backup" ? "backup-row" : ""}>
                <td className="t-name"><CatDot cat={it.category} /> {it.name}{it.decision === "Backup" && <span className="pill backup">BACKUP</span>}</td>
                <td>{it.budgetCat}</td>
                <td>{dayFor(it.date)?.short || "—"}</td>
                <td>
                  <select value={it.status} onChange={(e) => update(it.id, { status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="num">{money(it.cost)}{it.placeholder && <span className="est">est.</span>}</td>
                <td><input type="checkbox" checked={!!it.paid} onChange={(e) => update(it.id, { paid: e.target.checked })} /></td>
                <td className="t-conf">{it.conf || <span className="dim2">—</span>}</td>
                <td>{it.cancelBy || <span className="dim2">—</span>}</td>
                <td className="t-act">
                  {it.link && <a href={it.link} target="_blank" rel="noreferrer" title="Booking link"><ExternalLink size={14} /></a>}
                  <button onClick={() => edit(it.id)} title="Edit"><Pencil size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Backup rows (Matanuska, city tour) are excluded from booking progress and totals until promoted to Keep.</p>
    </div>
  );
}

/* ================================================================
   BUDGET
   ================================================================ */
function Budget({ d }) {
  const cats = BUDGET_CATS.filter((c) => d.byBudget[c].est > 0);
  const max = Math.max(...cats.map((c) => d.byBudget[c].est), 1);
  return (
    <div className="page">
      <PageHead title="Budget" sub="Totals recalculate automatically from item costs and decisions." />
      <div className="stat-row">
        <div className="stat card"><div className="stat-label">Estimated total (Keep items)</div><div className="stat-big">{money(d.estTotal)}</div><div className="stat-foot">{money(Math.round(d.estTotal / TRAVELERS))} per person</div></div>
        <div className="stat card"><div className="stat-label">Paid</div><div className="stat-big">{money(d.paidTotal)}</div><div className="stat-foot">{money(d.estTotal - d.paidTotal)} unpaid</div></div>
        <div className="stat card"><div className="stat-label">Optional add-ons (Maybes)</div><div className="stat-big">+{money(d.maybeTotal)}</div><div className="stat-foot">Trip becomes {money(d.estTotal + d.maybeTotal)} if all kept</div></div>
      </div>
      <div className="card">
        <h2><Wallet size={16} /> By category</h2>
        {cats.map((c) => (
          <div key={c} className="bud-row">
            <span className="bud-name">{c}</span>
            <div className="bud-bar"><div className="bud-fill" style={{ width: (d.byBudget[c].est / max) * 100 + "%", background: c === "Optional" ? "#B45309" : "#1B5E44" }} /></div>
            <span className="bud-num">{money(d.byBudget[c].est)}</span>
            <span className="bud-paid">{d.byBudget[c].paid ? money(d.byBudget[c].paid) + " paid" : ""}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h2><Shuffle size={16} /> What-if: Maybe items</h2>
        {d.maybes.length === 0 ? <p className="hint">No open Maybes.</p> : d.maybes.map((m) => (
          <div key={m.id} className="mini-row static">
            <CatDot cat={m.category} /><span className="mini-name">{m.name}</span>
            <span className="mini-meta">adds {money(m.cost)} → trip {money(d.estTotal + m.cost)}</span>
          </div>
        ))}
        <p className="hint">Flip a card to Keep on the Swipe Board and these totals move automatically.</p>
      </div>
      <p className="hint">Amounts marked "est." are placeholders (lodging, flights, food, gas) — replace them as you book. Tour prices are realistic 2026 estimates for {TRAVELERS} people.</p>
    </div>
  );
}

/* ================================================================
   SWIPE BOARD
   ================================================================ */
function Board({ cards, update, edit }) {
  const [filter, setFilter] = useState("All");
  const shown = cards.filter((c) => filter === "All" || c.decision === filter);
  const order = { Keep: 0, Maybe: 1, Backup: 2, Pass: 3 };
  shown.sort((a, b) => (order[a.decision] ?? 9) - (order[b.decision] ?? 9));
  return (
    <div className="page">
      <PageHead title="Activity Swipe Board" sub="This-or-that decisions. Keep → joins the plan and gets flagged for booking. Pass → leaves the itinerary but stays here." />
      <div className="seg">
        {["All", ...DECISIONS].map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f}</button>)}
      </div>
      <div className="board">
        {shown.map((c) => {
          const C = CATEGORIES[c.category]; const Icon = C.icon;
          return (
            <div key={c.id} className={"b-card dec-" + c.decision.toLowerCase()}>
              <div className="b-top">
                <span className="item-ic" style={{ background: C.color + "1A", color: C.color }}><Icon size={16} /></span>
                <span className={"pill d-" + c.decision.toLowerCase()}>{c.decision.toUpperCase()}</span>
              </div>
              <div className="b-name">{c.name}</div>
              <div className="b-meta">{c.location !== "—" ? c.location : c.area}{c.board?.duration ? " · " + c.board.duration : ""}</div>
              <div className="b-facts">
                <span>{c.cost ? money(c.cost) : "Free"}</span>
                <span>Route fit: {c.routeFit}</span>
                <span>{c.weather ? "Weather risk" : "Weather-proof"}</span>
                <span>Effort: {c.intensity}</span>
              </div>
              {c.board?.competes && <div className="b-line"><b>Competes with:</b> {c.board.competes}</div>}
              {c.board?.reason && <div className="b-line reason">{c.board.reason}</div>}
              {c.notes && <div className="b-line dim">{c.notes}</div>}
              <div className="b-actions">
                {DECISIONS.map((dd) => (
                  <button key={dd} className={"b-btn" + (c.decision === dd ? " on d-" + dd.toLowerCase() : "")} onClick={() => update(c.id, { decision: dd })}>{dd}</button>
                ))}
                <button className="b-btn edit" onClick={() => edit(c.id)}><Pencil size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   PACKING
   ================================================================ */
function Packing({ packing, setPacking }) {
  const toggle = (gi, ii) => setPacking((prev) => prev.map((g, a) =>
    a !== gi ? g : { ...g, items: g.items.map((t, b) => (b !== ii ? t : { ...t, done: !t.done })) }
  ));
  const total = packing.reduce((s, g) => s + g.items.length, 0);
  const done = packing.reduce((s, g) => s + g.items.filter((t) => t.done).length, 0);
  return (
    <div className="page">
      <PageHead title="Packing & Gear" sub={`${done}/${total} packed — checkmarks save automatically.`} />
      <div className="bar wide"><div className="bar-fill" style={{ width: (done / total) * 100 + "%" }} /></div>
      <div className="pack-grid">
        {packing.map((g, gi) => (
          <section key={g.cat} className="card">
            <h2>{g.cat}</h2>
            {g.items.map((t, ii) => (
              <button key={ii} className={"pk" + (t.done ? " done" : "")} onClick={() => toggle(gi, ii)}>
                {t.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}<span>{t.text}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/* Real map: Leaflet + OpenStreetMap. Pins from STOPS, route as a polyline.
   Note: the line connects stops directly (not road-following) — fine for
   an overview. For true road routing you'd add a service like OSRM later. */

const STOPS = [
  { name: "Anchorage airport", lat: 61.1744, lng: -149.9964, day: "Aug 9 & 16" },
  { name: "Hatcher Pass / Reed Lakes", lat: 61.79, lng: -149.19, day: "Aug 10" },
  { name: "Palmer / Wasilla", lat: 61.5997, lng: -149.1128, day: "Aug 10 night" },
  { name: "Knik Glacier heli base", lat: 61.462, lng: -148.82, day: "Aug 11 AM" },
  { name: "Alaska Wildlife Conservation Center", lat: 60.832, lng: -148.976, day: "Aug 11 PM" },
  { name: "Seward", lat: 60.1042, lng: -149.4422, day: "Aug 11–13" },
  { name: "Exit Glacier / Harding Icefield", lat: 60.1867, lng: -149.6319, day: "Aug 12" },
  { name: "Homer", lat: 59.6425, lng: -151.5483, day: "Aug 13–15" },
];

function MapView() {
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current._leaflet_id) return; // don't re-init on tab revisit
    const map = L.map(mapRef.current, { scrollWheelZoom: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    // Route line: out (ANC→…→Homer) and back (Homer→ANC)
    const pts = STOPS.map((s) => [s.lat, s.lng]);
    L.polyline([...pts, pts[0]], { color: "#1B5E44", weight: 3, opacity: 0.75, dashArray: "1 0" }).addTo(map);

    // Numbered pins (divIcons avoid Vite's broken default-icon paths)
    STOPS.forEach((s, i) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#1B5E44;color:#fff;width:26px;height:26px;border-radius:99px;display:flex;align-items:center;justify-content:center;font:700 12px 'Public Sans',sans-serif;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${i + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([s.lat, s.lng], { icon }).addTo(map)
        .bindPopup(`<b>${s.name}</b><br/>${s.day}`);
    });

    map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }, []);

  return (
    <div className="page">
      <PageHead title="Route" sub="Anchorage loop, ~700 miles. Pins in trip order — tap one for the dates. Line is stop-to-stop, not road-exact." />
      <div className="card" style={{ padding: 6 }}>
        <div ref={mapRef} style={{ height: "62vh", minHeight: 380, borderRadius: 10 }} />
      </div>
      <div className="card">
        <h2><AlertTriangle size={16} /> Drive notes</h2>
        <p className="hint">Longest single drive: Homer → Anchorage (~4.5 hr, Aug 15). Fuel up in Soldotna. Turnagain Arm has summer weekend traffic — leave Homer by 10 AM. The Reed Lakes access road (Archangel Rd) is rough gravel; take it slow in the rental.</p>
      </div>
    </div>
  );
}

/* ================================================================
   AI ASSISTANT — "Alaska Trip Assistant"
   ----------------------------------------------------------------
   PROTOTYPE: replies are generated locally from live trip state so
   the demo is genuinely useful offline. NO API key in the frontend.

   TO CONNECT A REAL CLAUDE BACKEND LATER:
   1. Stand up a server route, e.g.  POST /api/claude-chat
      Body: { messages, tripContext }   ← tripContext is built below
   2. On the SERVER, call Anthropic's Messages API with your key:
        POST https://api.anthropic.com/v1/messages
        { model, system: "You are the Alaska Trip Assistant...",
          messages: [...history, {role:"user", content:
            question + "\n\nTRIP DATA:\n" + JSON.stringify(tripContext)}] }
   3. In send() below, replace mockAnswer(...) with:
        const res = await fetch("/api/claude-chat", { method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ messages, tripContext: useCtx ? buildContext(items, d) : null }) });
        const { reply } = await res.json();
   The assistant should only SUGGEST changes — the user applies them
   in the UI. It never books or edits on its own.
   ================================================================ */
function buildContext(items, d) {
  return {
    trip: { title: "Alaska Trip 2026", dates: "2026-08-09 to 2026-08-16", travelers: TRAVELERS },
    items: items.map(({ id, name, date, category, budgetCat, status, priority, decision, cost, paid, weather, intensity, routeFit, notes }) =>
      ({ id, name, date, category, budgetCat, status, priority, decision, cost, paid, weather, intensity, routeFit, notes })),
    totals: { estimated: d.estTotal, paid: d.paidTotal, optional: d.maybeTotal },
  };
}

const SUGGESTED = [
  "What do I still need to book?",
  "What should I do if the helicopter is canceled?",
  "What is the budget impact of adding fishing?",
  "Show me all weather-dependent items",
  "Give me a packing list for Harding Icefield",
  "Which day is too crowded?",
  "What happens if we cut Homer?",
];

function mockAnswer(q, items, d, useCtx) {
  const s = q.toLowerCase();
  if (!useCtx) return "Context is off, so I can only answer generally. Flip on \"Use current trip data as context\" and I'll answer from your live itinerary, bookings, and budget.";
  if (s.includes("book")) {
    if (!d.toBook.length) return "Nothing left to book — all " + d.bookables.length + " bookable items are locked in. ✅";
    return "You still need to book " + d.toBook.length + " items:\n\n" +
      d.toBook.map((it) => `• ${it.name} — ${it.cost ? money(it.cost) : "TBD"}${it.date ? " (" + dayFor(it.date)?.short + ")" : ""}`).join("\n") +
      "\n\nSuggested order: Knik helicopter first (limited AM slots), then Kenai Fjords, then lodging Seward → Homer → the two airport nights, then the rental car.";
  }
  if (s.includes("helicopter") && (s.includes("cancel") || s.includes("weather"))) {
    const bk = items.find((i) => i.id === "bk-matanuska");
    return "If weather cancels the Knik helicopter on Aug 11:\n\n1. Pivot to the backup card: " + bk.name + " (" + money(bk.cost) + ", ~3–4 hr, 1.5 hr NE of Palmer).\n2. Push AWCC to a short evening stop — it's directly on the route to Seward and closes at 8 PM in summer.\n3. Still sleep in Seward as planned; nothing downstream moves.\n\nWant me to outline the rescheduled Tuesday hour by hour? (You'd apply it yourself — I only suggest.)";
  }
  if (s.includes("fishing")) {
    const f = items.find((i) => i.id === "op-fish");
    return `Adding Homer fishing (${money(f.cost)} for 2):\n\n• Trip total goes ${money(d.estTotal)} → ${money(d.estTotal + (f.decision === "Maybe" ? f.cost : 0))}\n• Per person: +${money(f.cost / TRAVELERS)}\n• Schedule cost: it takes the 7 AM–noon block of your ONLY unstructured day (Aug 14)\n• Fish processing/shipping typically adds $100–200 more\n\nIf the relaxed Homer morning matters more than halibut, Pass it. If you Keep it, book a 7 AM departure so the afternoon stays free.`;
  }
  if (s.includes("weather")) {
    return "Weather-dependent items (" + d.weatherItems.length + "):\n\n" +
      d.weatherItems.map((it) => `• ${it.name} — ${dayFor(it.date)?.short || "flexible"}`).join("\n") +
      "\n\nBiggest risk: the helicopter (hard cancel) and the Kenai Fjords boat (rough-water turnback). Reed Lakes and Harding are hikeable in drizzle but skip them in real rain — the boulder field and the upper snowfield get sketchy wet.";
  }
  if (s.includes("packing") && s.includes("harding")) {
    return "Harding Icefield day pack (8–9 hr, ~3,500 ft gain):\n\n• 3L water minimum per person\n• Packed lunch + double snacks\n• Rain shell AND warm mid-layer — icefield rim is cold even in August\n• Beanie + gloves\n• Trekking poles for the descent\n• Sunscreen + sunglasses (snow glare)\n• Bear spray accessible, not buried\n• Headlamp (just in case)\n• Offline map + charged portable battery\n\nStart by 7:30 AM. Turn around by 2 PM regardless of where you are.";
  }
  if (s.includes("crowded") || s.includes("too much") || s.includes("busiest")) {
    return "Tuesday Aug 11 is your most fragile day: helicopter (weather-dependent) + lunch + AWCC + a 1.75 hr drive to Seward. It works because AWCC is flexible and on-route — but if the helicopter slips to afternoon, drop AWCC to 30 minutes or skip it.\n\nPhysically, Wed Aug 12 (Harding) is the heaviest — protect the evening. Everything else has slack built in.";
  }
  if (s.includes("cut homer") || (s.includes("homer") && s.includes("cut"))) {
    const homerCost = items.filter((i) => ["lg-0813","lg-0814"].includes(i.id)).reduce((x, i) => x + i.cost, 0);
    return `Cutting Homer would:\n\n• Save ~${money(homerCost)} in lodging + ~$60 gas (skips 340 round-trip miles)\n• Free Aug 13 PM + all of Aug 14\n• Unlock options: 2nd Seward day (kayak/dog sled), Whittier day trip, or an Anchorage buffer day\n\nBut: Homer is your only decompression day between Harding and the 4 AM wake-up. My take — keep it unless budget forces the call. If you do cut it, sleep Aug 13–14 in Seward and flip the Anchorage salmon-fishing card from Pass to Maybe.`;
  }
  if (s.includes("rewrite") || s.includes("move") && s.includes("boat")) {
    return "If the Kenai Fjords boat moves (e.g., to Aug 12):\n\n• Swap Harding to Aug 13 — the trail doesn't need a reservation, the boat does\n• Keep both Seward nights unchanged\n• Homer drive still happens the evening of the SECOND Seward activity day\n\nRule of thumb for this trip: boats and helicopters are fixed points; hikes flex around them. Change the item dates in the Itinerary tab and every view will follow.";
  }
  return "I can answer from your live trip data — try one of the suggested prompts, or ask about bookings, budget impact, weather backups, packing, or what-if itinerary changes. (In the full version this panel calls Claude through POST /api/claude-chat with your trip data as context.)";
}

function Chat({ open, close, items, d }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Hi! I'm your Alaska Trip Assistant. I can see your live itinerary, bookings, and budget. What do you want to figure out?" }]);
  const [input, setInput] = useState("");
  const [useCtx, setUseCtx] = useState(true);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  const send = (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    // PROTOTYPE: local mock. Real version → POST /api/claude-chat (see block comment above).
    setTimeout(() => {
      const reply = mockAnswer(q, items, d, useCtx);
      setMsgs((m) => [...m, { role: "assistant", text: reply }]);
      setBusy(false);
    }, 450);
  };

  return (
    <div className={"chat" + (open ? " open" : "")} role="dialog" aria-label="Alaska Trip Assistant">
      <div className="chat-head">
        <span className="chat-title"><Sparkles size={16} /> Alaska Trip Assistant</span>
        <button className="x" onClick={close} aria-label="Close"><X size={18} /></button>
      </div>
      <label className="chat-ctx">
        <input type="checkbox" checked={useCtx} onChange={(e) => setUseCtx(e.target.checked)} />
        Use current trip data as context
      </label>
      <div className="chat-body">
        {msgs.map((m, i) => <div key={i} className={"msg " + m.role}>{m.text}</div>)}
        {busy && <div className="msg assistant dim">Thinking…</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-sug">
        {SUGGESTED.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
      </div>
      <div className="chat-in">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the trip…"
          onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={() => send()} aria-label="Send"><Send size={16} /></button>
      </div>
      <div className="chat-foot">Suggests changes only — you apply them. Never books anything.</div>
    </div>
  );
}

/* ================================================================
   EDIT DRAWER — the one write-path UI. Every field of the model.
   ================================================================ */

const F = ({ label, children }) => (
  <label className="f"><span>{label}</span>{children}</label>
);
function EditDrawer({ item, update, close }) {
  const set = (k) => (e) => update(item.id, { [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const setNum = (k) => (e) => update(item.id, { [k]: Number(e.target.value) || 0, placeholder: false });
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="drawer" role="dialog" aria-label={"Edit " + item.name}>
        <div className="drawer-head"><b>Edit item</b><button className="x" onClick={close}><X size={18} /></button></div>
        <div className="drawer-body">
          <F label="Name"><input value={item.name} onChange={set("name")} /></F>
          <div className="f2">
            <F label="Date"><select value={item.date || ""} onChange={(e) => update(item.id, { date: e.target.value || null })}>
              <option value="">No date / trip-wide</option>{DAYS.map((dd) => <option key={dd.date} value={dd.date}>{dd.label}</option>)}
            </select></F>
            <F label="Category"><select value={item.category} onChange={set("category")}>{Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}</select></F>
          </div>
          <div className="f2">
            <F label="Start"><input value={item.start} onChange={set("start")} placeholder="09:00" /></F>
            <F label="End"><input value={item.end} onChange={set("end")} placeholder="12:00" /></F>
          </div>
          <F label="Location"><input value={item.location} onChange={set("location")} /></F>
          <F label="City / area"><input value={item.area} onChange={set("area")} /></F>
          <div className="f2">
            <F label="Status"><select value={item.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></F>
            <F label="Priority"><select value={item.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></F>
          </div>
          <div className="f2">
            <F label="Decision"><select value={item.decision} onChange={set("decision")}>{DECISIONS.map((dd) => <option key={dd}>{dd}</option>)}</select></F>
            <F label={"Cost (total, " + TRAVELERS + " ppl)"}><input type="number" value={item.cost} onChange={setNum("cost")} /></F>
          </div>
          <div className="f3">
            <F label="Paid"><input type="checkbox" checked={!!item.paid} onChange={set("paid")} /></F>
            <F label="Weather dep."><input type="checkbox" checked={!!item.weather} onChange={set("weather")} /></F>
            <F label="Budget cat."><select value={item.budgetCat} onChange={set("budgetCat")}>{BUDGET_CATS.map((b) => <option key={b}>{b}</option>)}</select></F>
          </div>
          <div className="f2">
            <F label="Physical intensity"><select value={item.intensity} onChange={set("intensity")}>{INTENSITIES.map((x) => <option key={x}>{x}</option>)}</select></F>
            <F label="Route fit"><select value={item.routeFit} onChange={set("routeFit")}>{ROUTE_FITS.map((x) => <option key={x}>{x}</option>)}</select></F>
          </div>
          <F label="Booking link"><input value={item.link} onChange={set("link")} placeholder="https://…" /></F>
          <div className="f2">
            <F label="Confirmation #"><input value={item.conf} onChange={set("conf")} /></F>
            <F label="Cancellation deadline"><input value={item.cancelBy} onChange={set("cancelBy")} placeholder="e.g. Aug 4" /></F>
          </div>
          <F label="Notes"><textarea rows={3} value={item.notes} onChange={set("notes")} /></F>
          <p className="hint">Edits ripple everywhere: itinerary, bookings, budget, swipe board, and the dashboard update from this one record.</p>
        </div>
        <div className="drawer-foot"><button className="primary" onClick={close}>Done</button></div>
      </div>
    </>
  );
}

/* ---------- shared bits ---------- */
function PageHead({ title, sub }) {
  return <header className="page-head"><h1>{title}</h1><p>{sub}</p></header>;
}
function CatDot({ cat }) {
  return <span className="dot" style={{ background: CATEGORIES[cat]?.color || "#999" }} />;
}
function StatusPill({ status }) {
  const cls = { "Need to Book": "todo", Booked: "ok", Confirmed: "ok", Paid: "paid", Backup: "backup", Canceled: "off", Idea: "idea", Planned: "plan" }[status] || "plan";
  return <span className={"pill " + cls}>{status}</span>;
}

/* ================================================================
   STYLES — light alpine theme: ice white, pine green, glacier blue,
   fireweed accents. Bricolage Grotesque display / Public Sans body.
   ================================================================ */
function StyleBlock() {
  return <style>{`
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Public+Sans:wght@400;500;600;700&display=swap');
  :root{
    --bg:#F2F7F7; --card:#FFFFFF; --ink:#17302B; --dim:#5E706D; --line:#DCE8E7;
    --pine:#1B5E44; --pine-deep:#123D2D; --ice:#CBE7EE; --ice-deep:#8FC7D6;
    --fire:#B23A5E; --amber:#B45309;
    --r:14px; --disp:'Bricolage Grotesque',system-ui,sans-serif; --body:'Public Sans',system-ui,sans-serif;
  }
  *{box-sizing:border-box;margin:0}
  .app{font-family:var(--body);background:var(--bg);color:var(--ink);min-height:100vh;display:flex;font-size:14px;line-height:1.45}
  button{font-family:inherit;cursor:pointer}
  h1,h2,.stat-big,.b-name{font-family:var(--disp)}
  a{color:var(--pine)}

  /* nav */
  .nav{width:208px;flex-shrink:0;background:var(--pine-deep);color:#EAF4F0;padding:18px 12px;display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh}
  .nav-brand{display:flex;gap:10px;align-items:center;padding:6px 8px 18px;color:#DFF3EA}
  .nav-brand-text{display:flex;flex-direction:column;line-height:1.15}
  .nav-brand-text b{font-family:var(--disp);font-size:16px}
  .nav-brand-text span{font-size:10.5px;opacity:.65}
  .nav-btn{display:flex;gap:10px;align-items:center;background:none;border:0;color:#C9DED6;padding:9px 10px;border-radius:9px;font-size:13.5px;text-align:left}
  .nav-btn:hover{background:rgba(255,255,255,.08);color:#fff}
  .nav-btn.on{background:rgba(255,255,255,.14);color:#fff;font-weight:600}
  .nav-btn.ai{margin-top:auto;color:#BFE9F2}
  .nav-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 8px 0}
  .reset{background:none;border:0;color:#8FB0A5;font-size:11px;display:flex;gap:5px;align-items:center}
  .reset:hover{color:#fff}
  .saved{font-size:11px;color:#7FD8B4;opacity:0;transition:opacity .3s}
  .saved.show{opacity:1}

  .main{flex:1;min-width:0}
  .page{max-width:960px;margin:0 auto;padding:26px 22px 90px;display:flex;flex-direction:column;gap:16px}
  .page-head h1{font-size:26px;font-weight:800;letter-spacing:-.01em}
  .page-head p{color:var(--dim);margin-top:3px;font-size:13px}

  /* hero */
  .hero{background:linear-gradient(180deg,#FFFFFF 0%,#EDF6F3 100%);border:1px solid var(--line);border-radius:18px;padding:24px 24px 8px}
  .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--pine)}
  .hero h1{font-size:34px;font-weight:800;letter-spacing:-.015em;margin:4px 0 2px}
  .hero-sub{color:var(--ink);font-size:13.5px}
  .hero-sub b{color:var(--pine)}
  .hero-route{color:var(--dim);font-size:12px;margin-top:6px}
  .ridge{width:100%;height:96px;margin-top:8px;display:block}
  .ridge-t{font:600 10px var(--body);fill:var(--dim)}

  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px}
  .card h2{font-size:14.5px;font-weight:700;display:flex;gap:7px;align-items:center;margin-bottom:10px;color:var(--pine-deep)}

  .stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
  .stat-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
  .stat-big{font-size:26px;font-weight:800;margin:4px 0 6px}
  .stat-big span{font-size:15px;color:var(--dim);font-weight:600}
  .stat-foot{font-size:11.5px;color:var(--dim)}
  .stat.warn .stat-big{color:var(--amber)}
  .bar{height:7px;background:var(--ice);border-radius:99px;overflow:hidden;margin-bottom:6px}
  .bar.wide{height:9px}
  .bar-fill{height:100%;background:var(--pine);border-radius:99px;transition:width .4s}

  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .mini-row{display:flex;gap:9px;align-items:center;width:100%;background:none;border:0;border-bottom:1px solid var(--line);padding:8px 2px;text-align:left;font-size:13px;color:var(--ink)}
  .mini-row:last-of-type{border-bottom:0}
  .mini-row:not(.static):hover{background:#F4FAF8}
  .mini-name{flex:1;font-weight:500}
  .mini-meta{color:var(--dim);font-size:12px}
  .hint{color:var(--dim);font-size:12px;margin-top:8px}

  .quick-row{display:flex;flex-wrap:wrap;gap:8px}
  .quick{display:flex;gap:7px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:99px;padding:8px 14px;font-size:12.5px;font-weight:600;color:var(--pine-deep)}
  .quick:hover{border-color:var(--pine);background:#F0F8F5}
  .quick.ai{background:var(--pine);color:#fff;border-color:var(--pine)}

  .dot{width:9px;height:9px;border-radius:99px;flex-shrink:0}
  .pill{font-size:10px;font-weight:700;letter-spacing:.05em;padding:3px 8px;border-radius:99px;white-space:nowrap}
  .pill.high,.pill.d-pass{background:#F7E3E9;color:var(--fire)}
  .pill.medium{background:#FBEED9;color:var(--amber)}
  .pill.low{background:#E3F0EC;color:var(--pine)}
  .pill.todo{background:#FBEED9;color:var(--amber)}
  .pill.ok,.pill.d-keep{background:#DFF0E8;color:var(--pine)}
  .pill.paid{background:var(--pine);color:#fff}
  .pill.backup,.pill.d-backup{background:#E7EDF5;color:#3E5C8A}
  .pill.off{background:#EEE;color:#888}
  .pill.idea,.pill.d-maybe{background:#EFE9F7;color:#6D4FA3}
  .pill.plan{background:var(--ice);color:#155E70}

  /* itinerary */
  .seg{display:flex;gap:6px;flex-wrap:wrap}
  .seg button{background:#fff;border:1px solid var(--line);border-radius:99px;padding:7px 14px;font-size:12.5px;font-weight:600;color:var(--dim)}
  .seg button.on{background:var(--pine);border-color:var(--pine);color:#fff}
  .day-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .day-title{color:var(--dim);font-size:12px;margin-left:10px}
  .item-row{display:flex;gap:10px;align-items:center;width:100%;background:none;border:0;border-top:1px solid var(--line);padding:9px 2px;text-align:left;color:var(--ink)}
  .item-row:hover{background:#F4FAF8}
  .item-ic{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .item-main{flex:1;min-width:0;display:flex;flex-direction:column}
  .item-name{font-weight:600;font-size:13.5px}
  .item-meta{color:var(--dim);font-size:11.5px}
  .dim{color:var(--dim)} .dim2{color:#B9C6C4} .hot{color:var(--fire)}
  .sub-h{margin:12px 0 4px}

  .cal{display:grid;grid-template-columns:repeat(8,minmax(120px,1fr));gap:8px;overflow-x:auto}
  .cal-col{background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px;min-width:120px}
  .cal-head{font-family:var(--disp);font-weight:700;font-size:12px;margin-bottom:6px;color:var(--pine-deep)}
  .cal-item{display:block;width:100%;text-align:left;background:#F7FBFA;border:0;border-left:3px solid;border-radius:6px;padding:6px 7px;font-size:11px;margin-bottom:5px;color:var(--ink)}
  .cal-item:hover{background:#ECF5F1}
  .cal-time{display:block;font-size:9.5px;color:var(--dim);font-weight:700}

  /* bookings table */
  .table-wrap{overflow-x:auto;padding:6px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);text-align:left;padding:8px 9px;border-bottom:1.5px solid var(--line)}
  td{padding:8px 9px;border-bottom:1px solid var(--line);vertical-align:middle}
  .t-name{font-weight:600;min-width:210px}
  .t-name .dot{display:inline-block;margin-right:6px}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .est{font-size:9.5px;color:var(--amber);margin-left:4px;font-weight:700}
  .t-conf{max-width:110px;overflow:hidden;text-overflow:ellipsis}
  .t-act{white-space:nowrap}
  .t-act button,.t-act a{background:none;border:0;color:var(--dim);padding:3px}
  .t-act button:hover,.t-act a:hover{color:var(--pine)}
  .backup-row{opacity:.62}
  select,input,textarea{font-family:inherit;font-size:12.5px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:#fff;color:var(--ink);max-width:100%}
  select:focus,input:focus,textarea:focus,button:focus-visible{outline:2px solid var(--ice-deep);outline-offset:1px}

  /* budget */
  .bud-row{display:grid;grid-template-columns:130px 1fr 78px 88px;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
  .bud-row:last-child{border-bottom:0}
  .bud-name{font-weight:600;font-size:12.5px}
  .bud-bar{height:9px;background:#EDF3F2;border-radius:99px;overflow:hidden}
  .bud-fill{height:100%;border-radius:99px}
  .bud-num{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
  .bud-paid{font-size:11px;color:var(--pine);text-align:right}

  /* board */
  .board{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:12px}
  .b-card{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:14px;display:flex;flex-direction:column;gap:8px}
  .b-card.dec-keep{border-top:3px solid var(--pine)}
  .b-card.dec-maybe{border-top:3px solid #6D4FA3}
  .b-card.dec-backup{border-top:3px solid #3E5C8A}
  .b-card.dec-pass{border-top:3px solid var(--fire);opacity:.72}
  .b-top{display:flex;justify-content:space-between;align-items:center}
  .b-name{font-size:15px;font-weight:700;line-height:1.25}
  .b-meta{color:var(--dim);font-size:12px}
  .b-facts{display:flex;flex-wrap:wrap;gap:5px}
  .b-facts span{background:#F1F7F5;border-radius:99px;padding:3px 9px;font-size:10.5px;font-weight:600;color:var(--pine-deep)}
  .b-line{font-size:11.5px;color:var(--ink)}
  .b-line.reason{color:var(--pine-deep);font-weight:600}
  .b-line.dim{color:var(--dim)}
  .b-actions{display:flex;gap:5px;margin-top:auto;padding-top:6px}
  .b-btn{flex:1;border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 0;font-size:11px;font-weight:700;color:var(--dim)}
  .b-btn.on.d-keep{background:var(--pine);border-color:var(--pine);color:#fff}
  .b-btn.on.d-maybe{background:#6D4FA3;border-color:#6D4FA3;color:#fff}
  .b-btn.on.d-backup{background:#3E5C8A;border-color:#3E5C8A;color:#fff}
  .b-btn.on.d-pass{background:var(--fire);border-color:var(--fire);color:#fff}
  .b-btn.edit{flex:0 0 34px;display:flex;align-items:center;justify-content:center}

  /* packing */
  .pack-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .pk{display:flex;gap:9px;align-items:flex-start;width:100%;background:none;border:0;padding:6px 2px;text-align:left;font-size:13px;color:var(--ink)}
  .pk svg{flex-shrink:0;color:var(--dim);margin-top:1px}
  .pk.done{color:var(--dim);text-decoration:line-through}
  .pk.done svg{color:var(--pine)}

  /* route */
  .route{padding:18px 18px 6px}
  .rt{display:flex;gap:14px}
  .rt-rail{display:flex;flex-direction:column;align-items:center;width:16px}
  .rt-dot{width:12px;height:12px;border-radius:99px;background:#fff;border:3px solid var(--pine);flex-shrink:0}
  .rt-dot.end{background:var(--pine)}
  .rt-line{width:2.5px;flex:1;background:linear-gradient(var(--ice-deep),var(--pine));min-height:26px;margin:2px 0}
  .rt-body{padding-bottom:16px}
  .rt-stop{font-family:var(--disp);font-weight:700;font-size:14px}
  .rt-day{font-family:var(--body);font-weight:600;font-size:10.5px;color:#fff;background:var(--pine);border-radius:99px;padding:2px 8px;margin-left:8px;vertical-align:2px}
  .rt-note{color:var(--dim);font-size:12px;margin-top:2px}

  /* chat */
  .fab{position:fixed;right:18px;bottom:18px;width:52px;height:52px;border-radius:99px;background:var(--pine);color:#fff;border:0;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(18,61,45,.35);z-index:40}
  .fab:hover{background:var(--pine-deep)}
  .chat{position:fixed;top:0;right:0;height:100vh;width:min(400px,100vw);background:#fff;border-left:1px solid var(--line);display:flex;flex-direction:column;transform:translateX(105%);transition:transform .28s ease;z-index:60;box-shadow:-8px 0 30px rgba(18,61,45,.12)}
  .chat.open{transform:none}
  .chat-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--pine-deep);color:#fff}
  .chat-title{display:flex;gap:8px;align-items:center;font-family:var(--disp);font-weight:700;font-size:14px}
  .x{background:none;border:0;color:inherit;opacity:.8}
  .x:hover{opacity:1}
  .chat-ctx{display:flex;gap:8px;align-items:center;font-size:11.5px;padding:9px 16px;border-bottom:1px solid var(--line);color:var(--dim);font-weight:600}
  .chat-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;background:#F6FAF9}
  .msg{max-width:88%;padding:9px 12px;border-radius:13px;font-size:12.8px;white-space:pre-wrap;line-height:1.5}
  .msg.user{align-self:flex-end;background:var(--pine);color:#fff;border-bottom-right-radius:4px}
  .msg.assistant{align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px}
  .chat-sug{display:flex;gap:6px;overflow-x:auto;padding:9px 12px;border-top:1px solid var(--line)}
  .chat-sug button{flex-shrink:0;background:#F0F7F4;border:1px solid var(--line);border-radius:99px;padding:6px 11px;font-size:11px;font-weight:600;color:var(--pine-deep)}
  .chat-sug button:hover{border-color:var(--pine)}
  .chat-in{display:flex;gap:8px;padding:10px 12px}
  .chat-in input{flex:1}
  .chat-in button{background:var(--pine);color:#fff;border:0;border-radius:9px;width:40px;display:flex;align-items:center;justify-content:center}
  .chat-foot{font-size:10px;color:var(--dim);text-align:center;padding:0 12px 10px}

  /* edit drawer */
  .scrim{position:fixed;inset:0;background:rgba(18,48,43,.35);z-index:70}
  .drawer{position:fixed;top:0;right:0;height:100vh;width:min(420px,100vw);background:#fff;z-index:80;display:flex;flex-direction:column;box-shadow:-10px 0 34px rgba(18,61,45,.2)}
  .drawer-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);font-family:var(--disp);font-size:15px}
  .drawer-body{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:11px}
  .f{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;flex:1}
  .f input,.f select,.f textarea{font-weight:400;text-transform:none;letter-spacing:0;color:var(--ink);font-size:13px}
  .f input[type=checkbox]{width:18px;height:18px}
  .f2{display:flex;gap:10px}
  .f3{display:flex;gap:10px;align-items:flex-end}
  .drawer-foot{padding:12px 18px;border-top:1px solid var(--line)}
  .primary{width:100%;background:var(--pine);color:#fff;border:0;border-radius:10px;padding:11px;font-weight:700;font-size:13.5px}
  .primary:hover{background:var(--pine-deep)}

  @media (prefers-reduced-motion: reduce){ *{transition:none !important} }

  /* mobile */
  @media (max-width: 760px){
    .app{flex-direction:column}
    .nav{width:100%;height:auto;position:fixed;bottom:0;top:auto;flex-direction:row;padding:6px 4px;z-index:50;overflow-x:auto;align-items:center}
    .nav-brand,.nav-foot{display:none}
    .nav-btn{flex-direction:column;gap:3px;font-size:9.5px;padding:7px 9px;flex-shrink:0}
    .nav-btn.ai{margin-top:0}
    .page{padding:18px 14px 130px}
    .two-col{grid-template-columns:1fr}
    .hero h1{font-size:26px}
    .fab{bottom:74px}
    .bud-row{grid-template-columns:96px 1fr 66px;gap:7px}
    .bud-paid{display:none}
  }
  `}</style>;
}
