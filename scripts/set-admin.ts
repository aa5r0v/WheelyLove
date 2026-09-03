import { createClerkClient } from "@clerk/backend";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/set-admin.ts <email>");
    process.exit(1);
  }

  const clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });

  const { data: users } = await clerkClient.users.getUserList({
    emailAddress: [email],
  });

  const user = users[0];
  if (!user) {
    console.error(`No Clerk user found with email ${email}. Sign up first.`);
    process.exit(1);
  }

  await clerkClient.users.updateUserMetadata(user.id, {
    publicMetadata: { role: "admin" },
  });

  console.log(`${email} is now an admin.`);
}

main();
