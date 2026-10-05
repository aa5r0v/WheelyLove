import { seedDemo } from "./demo-data";

// Fictitious demo data (instructors Ани/Таби/Ели, 25 clients, the weekly
// schedule, 4 weeks back + 4 forward). Dry-run by default; --apply writes.
//   tsx scripts/seed-demo.ts [--apply] [--password <min 10 chars>]
// Without --password a random one is generated and printed ONCE.
// Remove everything again with scripts/remove-demo.ts.
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  let password: string | undefined;
  const eq = args.find((a) => a.startsWith("--password="));
  const i = args.indexOf("--password");
  if (eq) password = eq.slice("--password=".length);
  else if (i >= 0) {
    password = args[i + 1];
    if (!password || password.startsWith("--")) {
      console.error("--password needs a value.");
      process.exit(1);
    }
  }

  const r = await seedDemo({ apply, password });
  const { generatedPassword, ...counts } = r;
  console.log(apply ? "Demo data written:" : "DRY RUN (nothing written). Would create:");
  console.log(counts);
  if (apply && generatedPassword) {
    console.log(`Demo instructor password (shown once): ${generatedPassword}`);
  }
  if (!apply) console.log("Run again with --apply to write.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
