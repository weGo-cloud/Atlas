import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import {
  assistantSettings,
  businesses,
  furnitureProductPhotos,
  furnitureProducts,
  subscriptions,
  users,
} from "../src/lib/db/schema";
import { hashPassword } from "../src/features/auth/lib/password";

/**
 * Mission 030 — the Furniture-vertical counterpart to
 * scripts/backfill-business-ownership.ts's dev Auto business. A
 * separate script rather than folding this into that one or into
 * seed.ts: those two are Auto-specific by design (they reference
 * `vehicles` directly), and Section 2's scope rule is explicit about
 * not refactoring existing, working infrastructure to accommodate a
 * new vertical when an additive sibling does the job. Running this
 * script never touches `biz_dev`, its owner, or any vehicle row.
 *
 * Fixed, well-known IDs (idempotent — safe to re-run) for the same
 * reason as the Auto backfill script.
 */
const FURNITURE_BUSINESS_ID = "biz_dev_furniture";
const FURNITURE_OWNER_ID = "user_dev_furniture_owner";
const FURNITURE_OWNER_EMAIL = "owner@wegofurniture.dev";
const FURNITURE_OWNER_PASSWORD = "atlas-dev-2026";

type DemoProduct = {
  id: string;
  name: string;
  description: string;
  category: (typeof furnitureProducts.$inferInsert)["category"];
  price: number;
  condition: (typeof furnitureProducts.$inferInsert)["condition"];
  status: (typeof furnitureProducts.$inferInsert)["status"];
  material: string | null;
  color: string | null;
  dimensions: string | null;
  sku: string | null;
  /** Fill colour for the generated placeholder illustration. */
  hex: string;
};

/**
 * Mission 033 — a varied catalog (28 pieces) so filtering conversations
 * have interesting answers: several sofas at different price points and
 * colours, beds in different sizes, dining sets, office and storage
 * pieces, a few reserved/sold items. All entirely fictional sample data.
 */
const DEMO_PRODUCTS: DemoProduct[] = [
  // Sofas
  { id: "furn_demo_sofa_1", name: "Nairobi 3-Seater Sofa", description: "A generously cushioned 3-seater sofa in a durable woven fabric, built for daily family use.", category: "sofas", price: 68000, condition: "new", status: "available", material: "Woven fabric, hardwood frame", color: "Charcoal grey", dimensions: "210cm x 90cm x 85cm", sku: "SOF-NBI-001", hex: "#6b7280" },
  { id: "furn_demo_sofa_2", name: "Kilimani Compact 2-Seater", description: "A slim-armed 2-seater that suits small apartments and studio living rooms. Firm, easy-clean fabric.", category: "sofas", price: 42000, condition: "new", status: "available", material: "Polyester fabric, pine frame", color: "Light grey", dimensions: "150cm x 80cm x 82cm", sku: "SOF-KLM-006", hex: "#a8afba" },
  { id: "furn_demo_sofa_3", name: "Muthaiga Leather 3-Seater", description: "A classic full-leather 3-seater with deep seats and hardwood legs.", category: "sofas", price: 145000, condition: "new", status: "available", material: "Genuine leather, hardwood frame", color: "Tan brown", dimensions: "220cm x 95cm x 88cm", sku: "SOF-MTH-007", hex: "#a0673a" },
  { id: "furn_demo_sofa_4", name: "Lang'ata L-Shaped Sectional", description: "A large L-shaped sectional with a reversible chaise, seats five. Best for spacious living rooms.", category: "sofas", price: 118000, condition: "new", status: "available", material: "Woven fabric, hardwood frame", color: "Grey", dimensions: "290cm x 200cm x 85cm", sku: "SOF-LNG-008", hex: "#7a828e" },
  { id: "furn_demo_sofa_5", name: "Roysambu Loveseat", description: "A pre-owned loveseat in good condition with a fresh fabric cover.", category: "sofas", price: 24000, condition: "refurbished", status: "available", material: "Fabric, pine frame", color: "Beige", dimensions: "140cm x 78cm x 80cm", sku: "SOF-RYS-009", hex: "#cdb994" },
  { id: "furn_demo_sofa_6", name: "Runda Velvet 3-Seater", description: "A statement velvet 3-seater with gold-finish legs.", category: "sofas", price: 89000, condition: "new", status: "reserved", material: "Velvet, hardwood frame", color: "Emerald green", dimensions: "205cm x 90cm x 84cm", sku: "SOF-RND-010", hex: "#1f6f5b" },
  // Beds & mattresses
  { id: "furn_demo_bed_1", name: "Karen Queen Bed Frame", description: "Solid mahogany queen bed frame with a padded headboard.", category: "beds", price: 45000, condition: "new", status: "available", material: "Solid mahogany", color: "Walnut brown", dimensions: "160cm x 200cm", sku: "BED-KRN-002", hex: "#6b4a34" },
  { id: "furn_demo_bed_2", name: "Kileleshwa King Bed with Storage", description: "King-size bed with four under-bed storage drawers and an upholstered headboard.", category: "beds", price: 78000, condition: "new", status: "available", material: "Engineered wood, fabric headboard", color: "Grey", dimensions: "180cm x 200cm", sku: "BED-KLS-011", hex: "#8b919c" },
  { id: "furn_demo_bed_3", name: "Ngong Single Bed", description: "A sturdy single bed frame for a child's or guest room.", category: "beds", price: 16500, condition: "new", status: "available", material: "Pine", color: "Natural pine", dimensions: "90cm x 190cm", sku: "BED-NGG-012", hex: "#d2b48c" },
  { id: "furn_demo_bed_4", name: "Thika Double-Decker Bunk Bed", description: "A space-saving bunk bed with a ladder and safety rails, ideal for shared children's rooms.", category: "beds", price: 38000, condition: "new", status: "available", material: "Solid pine", color: "White", dimensions: "95cm x 200cm x 165cm", sku: "BED-THK-013", hex: "#e8e6df" },
  { id: "furn_demo_mattress_1", name: "Orthopaedic Queen Mattress", description: "A medium-firm orthopaedic mattress with a quilted top, sized for a queen bed.", category: "mattresses", price: 32000, condition: "new", status: "available", material: "High-density foam", color: "White", dimensions: "160cm x 200cm x 25cm", sku: "MAT-ORT-014", hex: "#f1efe8" },
  // Dining
  { id: "furn_demo_dining_1", name: "Westlands 6-Seater Dining Set", description: "A 6-seater dining table with matching upholstered chairs, seats six comfortably.", category: "dining_tables", price: 95000, condition: "new", status: "reserved", material: "Oak veneer, fabric-upholstered chairs", color: "Natural oak", dimensions: "180cm x 90cm x 75cm", sku: "DIN-WST-003", hex: "#b89566" },
  { id: "furn_demo_dining_2", name: "Kasarani 4-Seater Dining Set", description: "A compact round table with four chairs, good for smaller dining areas.", category: "dining_tables", price: 46000, condition: "new", status: "available", material: "MDF top, metal legs", color: "White and black", dimensions: "110cm x 110cm x 75cm", sku: "DIN-KSR-015", hex: "#efece4" },
  { id: "furn_demo_dining_3", name: "Karura 8-Seater Dining Table", description: "A long solid-wood dining table for large gatherings (chairs sold separately).", category: "dining_tables", price: 128000, condition: "new", status: "available", material: "Solid mahogany", color: "Dark mahogany", dimensions: "240cm x 100cm x 76cm", sku: "DIN-KRR-016", hex: "#4e3225" },
  { id: "furn_demo_chair_1", name: "Parklands Dining Chair (set of 4)", description: "A set of four cushioned dining chairs with sturdy wooden legs.", category: "dining_chairs", price: 26000, condition: "new", status: "available", material: "Fabric seat, beech legs", color: "Cream", dimensions: "45cm x 52cm x 90cm", sku: "CHR-PKL-017", hex: "#e6dcc3" },
  // Office
  { id: "furn_demo_office_1", name: "Upperhill Office Desk", description: "Compact office desk with two drawers, ideal for a home office.", category: "office_furniture", price: 22000, condition: "used", status: "available", material: "Engineered wood", color: "White", dimensions: "120cm x 60cm x 75cm", sku: "OFC-UPH-004", hex: "#ece9e2" },
  { id: "furn_demo_office_2", name: "Executive Office Desk with Return", description: "An L-shaped executive desk with a filing return and cable ports.", category: "office_furniture", price: 64000, condition: "new", status: "available", material: "Veneered MDF", color: "Dark walnut", dimensions: "180cm x 160cm x 75cm", sku: "OFC-EXE-018", hex: "#5b3f2e" },
  { id: "furn_demo_office_3", name: "Ergonomic Mesh Office Chair", description: "An adjustable ergonomic chair with lumbar support and a breathable mesh back.", category: "office_furniture", price: 19500, condition: "new", status: "available", material: "Mesh, nylon base", color: "Black", dimensions: "65cm x 65cm x 110cm", sku: "OFC-CHR-019", hex: "#2a2d33" },
  { id: "furn_demo_office_4", name: "Four-Drawer Filing Cabinet", description: "A lockable steel filing cabinet with four drawers.", category: "office_furniture", price: 21000, condition: "new", status: "sold", material: "Powder-coated steel", color: "Grey", dimensions: "47cm x 62cm x 132cm", sku: "OFC-FIL-020", hex: "#8a9099" },
  // Storage
  { id: "furn_demo_ward_1", name: "Eastleigh 3-Door Wardrobe", description: "A three-door wardrobe with hanging space, shelves and a mirror.", category: "wardrobes", price: 52000, condition: "new", status: "available", material: "Engineered wood", color: "Oak", dimensions: "150cm x 55cm x 200cm", sku: "WRD-EST-021", hex: "#c2a074" },
  { id: "furn_demo_ward_2", name: "South B Sliding-Door Wardrobe", description: "A modern sliding-door wardrobe that saves floor space, with soft-close runners.", category: "wardrobes", price: 74000, condition: "new", status: "available", material: "Engineered wood, mirrored glass", color: "White", dimensions: "180cm x 60cm x 210cm", sku: "WRD-STB-022", hex: "#f0eee8" },
  // Living room
  { id: "furn_demo_tvstand_1", name: "Lavington TV Stand", description: "Media console with open shelving and cable management, fits up to a 65-inch TV.", category: "tv_stands", price: 18500, condition: "new", status: "sold", material: "MDF, tempered glass", color: "Black", dimensions: "150cm x 40cm x 45cm", sku: "TVS-LVG-005", hex: "#25272c" },
  { id: "furn_demo_tvstand_2", name: "Ridgeways Floating TV Unit", description: "A wall-mounted TV unit with two drawers and LED strip lighting, for TVs up to 75 inches.", category: "tv_stands", price: 34000, condition: "new", status: "available", material: "MDF, high-gloss finish", color: "White and oak", dimensions: "200cm x 35cm x 40cm", sku: "TVS-RDG-023", hex: "#e4dccb" },
  { id: "furn_demo_coffee_1", name: "Gigiri Round Coffee Table", description: "A round marble-effect coffee table with a gold metal base.", category: "coffee_tables", price: 15500, condition: "new", status: "available", material: "Marble-effect top, metal base", color: "White and gold", dimensions: "80cm x 80cm x 45cm", sku: "CFT-GGR-024", hex: "#e9e6de" },
  { id: "furn_demo_coffee_2", name: "Hurlingham Nesting Tables (set of 2)", description: "Two nesting side tables in solid wood, easy to tuck away in small spaces.", category: "coffee_tables", price: 12800, condition: "new", status: "available", material: "Solid mahogany", color: "Walnut brown", dimensions: "60cm x 40cm x 50cm", sku: "CFT-HRL-025", hex: "#6f4c36" },
  // Outdoor
  { id: "furn_demo_outdoor_1", name: "Nyali Patio Set (4-Seater)", description: "A weather-resistant rattan-effect patio set with a glass-top table and four cushioned chairs.", category: "outdoor_furniture", price: 58000, condition: "new", status: "available", material: "Synthetic rattan, aluminium frame", color: "Brown", dimensions: "90cm x 90cm x 72cm (table)", sku: "OUT-NYL-026", hex: "#7d5a3f" },
  { id: "furn_demo_outdoor_2", name: "Diani Sun Lounger", description: "An adjustable poolside sun lounger with a quick-dry cushion.", category: "outdoor_furniture", price: 17500, condition: "new", status: "available", material: "Aluminium, textilene", color: "Grey", dimensions: "195cm x 65cm x 30cm", sku: "OUT-DNI-027", hex: "#7f8791" },
  // Other
  { id: "furn_demo_other_1", name: "Rongai Bookshelf (5-tier)", description: "A tall five-tier open bookshelf for books, plants and display pieces.", category: "other", price: 14500, condition: "new", status: "available", material: "Engineered wood", color: "Walnut brown", dimensions: "80cm x 30cm x 180cm", sku: "OTH-RNG-028", hex: "#6a4b39" },
  { id: "furn_demo_other_2", name: "Entryway Shoe Cabinet", description: "A slim shoe cabinet with a flip-down drawers design, holds up to 16 pairs.", category: "other", price: 11800, condition: "new", status: "available", material: "Engineered wood", color: "White", dimensions: "80cm x 24cm x 120cm", sku: "OTH-SHO-029", hex: "#ece9e1" },
];

/** Deterministic, dependency-free placeholder illustrations: a simple flat drawing per category in the item's colour. Never a copy of anyone's product photos. */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const value = (n >> shift) & 255;
    const next = amount < 0 ? value * (1 + amount) : value + (255 - value) * amount;
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

function illustration(category: string, hex: string): string {
  const dark = shade(hex, -0.25);
  const light = shade(hex, 0.18);
  const leg = "#3b3b40";
  const floor = `<ellipse cx="400" cy="420" rx="290" ry="20" fill="#000" opacity="0.10"/>`;
  let art = "";
  switch (category) {
    case "sofas":
      art = `<rect x="150" y="150" width="500" height="130" rx="40" fill="${dark}"/><rect x="110" y="230" width="580" height="120" rx="34" fill="${hex}"/><rect x="90" y="200" width="70" height="150" rx="30" fill="${light}"/><rect x="640" y="200" width="70" height="150" rx="30" fill="${light}"/><rect x="175" y="245" width="220" height="80" rx="20" fill="${light}"/><rect x="405" y="245" width="220" height="80" rx="20" fill="${light}"/><rect x="150" y="350" width="16" height="40" fill="${leg}"/><rect x="634" y="350" width="16" height="40" fill="${leg}"/>`;
      break;
    case "beds":
      art = `<rect x="130" y="130" width="540" height="150" rx="16" fill="${dark}"/><rect x="110" y="270" width="580" height="60" rx="10" fill="${hex}"/><rect x="130" y="235" width="540" height="50" rx="14" fill="#f4f2ec"/><rect x="170" y="205" width="150" height="45" rx="18" fill="#fff"/><rect x="480" y="205" width="150" height="45" rx="18" fill="#fff"/><rect x="110" y="330" width="22" height="60" fill="${leg}"/><rect x="668" y="330" width="22" height="60" fill="${leg}"/>`;
      break;
    case "mattresses":
      art = `<rect x="120" y="230" width="560" height="110" rx="22" fill="${hex}"/><rect x="120" y="230" width="560" height="34" rx="17" fill="${light}"/><path d="M180 290h440M180 315h440" stroke="${dark}" stroke-width="2" stroke-dasharray="6 8" opacity="0.5"/>`;
      break;
    case "dining_tables":
      art = `<ellipse cx="400" cy="230" rx="270" ry="70" fill="${hex}"/><ellipse cx="400" cy="224" rx="270" ry="70" fill="${light}"/><rect x="230" y="270" width="20" height="120" fill="${leg}"/><rect x="550" y="270" width="20" height="120" fill="${leg}"/><rect x="330" y="285" width="18" height="105" fill="${leg}"/><rect x="452" y="285" width="18" height="105" fill="${leg}"/>`;
      break;
    case "dining_chairs":
      art = `<rect x="290" y="110" width="220" height="170" rx="24" fill="${dark}"/><rect x="270" y="270" width="260" height="50" rx="16" fill="${hex}"/><rect x="290" y="320" width="18" height="80" fill="${leg}"/><rect x="492" y="320" width="18" height="80" fill="${leg}"/>`;
      break;
    case "office_furniture":
      art = `<rect x="120" y="210" width="560" height="26" rx="8" fill="${hex}"/><rect x="140" y="236" width="20" height="150" fill="${leg}"/><rect x="520" y="236" width="150" height="150" rx="6" fill="${dark}"/><rect x="535" y="256" width="120" height="50" rx="4" fill="${light}"/><rect x="535" y="316" width="120" height="50" rx="4" fill="${light}"/>`;
      break;
    case "wardrobes":
      art = `<rect x="250" y="60" width="300" height="340" rx="10" fill="${hex}"/><rect x="262" y="72" width="130" height="316" rx="6" fill="${light}"/><rect x="408" y="72" width="130" height="316" rx="6" fill="${light}"/><rect x="374" y="220" width="8" height="50" rx="4" fill="${dark}"/><rect x="418" y="220" width="8" height="50" rx="4" fill="${dark}"/>`;
      break;
    case "tv_stands":
      art = `<rect x="120" y="270" width="560" height="80" rx="10" fill="${hex}"/><rect x="140" y="285" width="160" height="50" rx="4" fill="${dark}"/><rect x="320" y="285" width="160" height="50" rx="4" fill="${light}"/><rect x="500" y="285" width="160" height="50" rx="4" fill="${dark}"/><rect x="150" y="350" width="16" height="40" fill="${leg}"/><rect x="634" y="350" width="16" height="40" fill="${leg}"/><rect x="240" y="110" width="320" height="150" rx="6" fill="#1c1d22"/>`;
      break;
    case "coffee_tables":
      art = `<ellipse cx="400" cy="250" rx="220" ry="55" fill="${hex}"/><ellipse cx="400" cy="244" rx="220" ry="55" fill="${light}"/><rect x="300" y="290" width="14" height="100" fill="${leg}"/><rect x="486" y="290" width="14" height="100" fill="${leg}"/>`;
      break;
    case "outdoor_furniture":
      art = `<rect x="150" y="190" width="200" height="120" rx="20" fill="${hex}"/><rect x="450" y="190" width="200" height="120" rx="20" fill="${hex}"/><ellipse cx="400" cy="270" rx="70" ry="22" fill="${light}"/><rect x="392" y="270" width="16" height="110" fill="${leg}"/><rect x="170" y="310" width="14" height="70" fill="${leg}"/><rect x="616" y="310" width="14" height="70" fill="${leg}"/>`;
      break;
    default:
      art = `<rect x="280" y="70" width="240" height="330" rx="8" fill="${hex}"/><path d="M280 150h240M280 230h240M280 310h240" stroke="${dark}" stroke-width="6"/><rect x="300" y="90" width="80" height="50" rx="3" fill="${light}"/><rect x="420" y="170" width="80" height="50" rx="3" fill="${light}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f3ee"/><stop offset="1" stop-color="#e5e0d8"/></linearGradient></defs><rect width="800" height="500" fill="url(#bg)"/>${floor}${art}</svg>`;
}

function writeIllustrations() {
  const dir = path.join(process.cwd(), "public", "demo-furniture");
  mkdirSync(dir, { recursive: true });
  for (const product of DEMO_PRODUCTS) {
    writeFileSync(path.join(dir, `${product.id}.svg`), illustration(product.category, product.hex));
  }
}

async function main() {
  const now = new Date().toISOString();

  const existingBusiness = await db.select().from(businesses).where(eq(businesses.id, FURNITURE_BUSINESS_ID)).limit(1);

  if (existingBusiness.length === 0) {
    await db.insert(businesses).values({
      id: FURNITURE_BUSINESS_ID,
      name: "Wego Furniture Demo",
      vertical: "furniture",
      websiteMode: "atlas_hosted",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created Furniture demo business: ${FURNITURE_BUSINESS_ID}`);
  } else {
    // Mission 033: make sure the public storefront (and its chat) is on for the demo business.
    await db.update(businesses).set({ websiteMode: "atlas_hosted", updatedAt: now }).where(eq(businesses.id, FURNITURE_BUSINESS_ID));
    console.log(`Furniture demo business already exists: ${FURNITURE_BUSINESS_ID}`);
  }

  // The public storefront requires a plan with the storefront capability.
  const existingSubscription = await db.select().from(subscriptions).where(eq(subscriptions.businessId, FURNITURE_BUSINESS_ID)).limit(1);
  if (existingSubscription.length === 0) {
    await db.insert(subscriptions).values({ id: "sub_dev_furniture", businessId: FURNITURE_BUSINESS_ID, plan: "growth", status: "active", createdAt: now, updatedAt: now });
    console.log("Created Growth subscription for the furniture demo business.");
  }

  const existingUser = await db.select().from(users).where(eq(users.id, FURNITURE_OWNER_ID)).limit(1);

  if (existingUser.length === 0) {
    const passwordHash = await hashPassword(FURNITURE_OWNER_PASSWORD);
    await db.insert(users).values({
      id: FURNITURE_OWNER_ID,
      businessId: FURNITURE_BUSINESS_ID,
      name: "Furniture Demo Owner",
      email: FURNITURE_OWNER_EMAIL,
      passwordHash,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created Furniture demo owner: ${FURNITURE_OWNER_EMAIL}`);
    console.log(`  Sign in with: ${FURNITURE_OWNER_EMAIL} / ${FURNITURE_OWNER_PASSWORD}`);
  } else {
    console.log(`Furniture demo owner already exists: ${FURNITURE_OWNER_EMAIL}`);
  }

  for (const product of DEMO_PRODUCTS) {
    await db
      .insert(furnitureProducts)
      .values({
        id: product.id,
        businessId: FURNITURE_BUSINESS_ID,
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        currency: "KES",
        condition: product.condition,
        status: product.status,
        material: product.material,
        color: product.color,
        dimensions: product.dimensions,
        sku: product.sku,
        addedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: furnitureProducts.id,
        set: {
          name: product.name,
          description: product.description,
          category: product.category,
          price: product.price,
          condition: product.condition,
          status: product.status,
          material: product.material,
          color: product.color,
          dimensions: product.dimensions,
          sku: product.sku,
          updatedAt: now,
        },
      });
  }
  console.log(`Seeded ${DEMO_PRODUCTS.length} furniture products.`);

  writeIllustrations();
  for (const product of DEMO_PRODUCTS) {
    await db
      .insert(furnitureProductPhotos)
      .values({ id: `photo_${product.id}`, furnitureProductId: product.id, url: `/demo-furniture/${product.id}.svg`, position: 0, isPrimary: true, createdAt: now })
      .onConflictDoNothing();
  }
  console.log("Wrote placeholder illustrations to public/demo-furniture and attached them as primary photos.");

  // Sample business facts for the assistant — the only non-inventory things it may state.
  await db
    .insert(assistantSettings)
    .values({
      businessId: FURNITURE_BUSINESS_ID,
      assistantEnabled: true,
      displayName: "Wego Furniture",
      openingHours: "Monday to Saturday, 9am to 6pm. Closed on Sundays.",
      location: "Sample showroom, Nairobi (demo data)",
      deliveryPolicy: "We deliver within Nairobi. Delivery cost depends on the location and is confirmed by the team.",
      paymentMethods: "M-Pesa, bank transfer and cash on delivery.",
      tone: "friendly",
      updatedAt: now,
    })
    .onConflictDoNothing();
  console.log("Seeded sample assistant business information.");
  console.log("\nFurniture demo seed complete.");
  console.log(`  Storefront:  /site/${FURNITURE_BUSINESS_ID}`);
  console.log(`  Staff login: ${FURNITURE_OWNER_EMAIL} / ${FURNITURE_OWNER_PASSWORD}  →  /app/assistant/demo`);
}

main().catch((error) => {
  console.error("Furniture demo seed failed:", error);
  process.exitCode = 1;
});
