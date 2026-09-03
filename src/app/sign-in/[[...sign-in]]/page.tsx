import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex justify-center bg-paper-dim py-16">
      <SignIn
        appearance={{
          variables: {
            colorPrimary: "#0a0a0a",
          },
        }}
      />
    </div>
  );
}
