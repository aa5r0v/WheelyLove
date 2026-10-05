import { removeDemo } from "./demo-data";

// Removes ONLY the demo data (users @demo.wheelylove.invalid, instructors with
// slug "demo-*" and their templates/sessions/bookings). Dry-run by default.
//   tsx scripts/remove-demo.ts [--apply]
async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const r = await removeDemo({ apply });
  console.log(apply ? "Demo data removed:" : "DRY RUN (nothing deleted). Would delete:");
  console.log(r);
  if (!apply) console.log("Run again with --apply to delete.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
