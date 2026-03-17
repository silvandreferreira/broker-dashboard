import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/access";

export const authOptions: NextAuthOptions = {
  // PrismaAdapter expects `@prisma/client` types; our client is generated to a custom output.
  // Casting keeps runtime behavior while avoiding TS type incompatibilities.
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session }) {
      const email = session.user?.email ?? null;
      if (!email) return session;

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, accessApproved: true },
      });

      (session.user as unknown as { id?: string }).id = user?.id;
      (session.user as unknown as { accessApproved?: boolean }).accessApproved =
        isAdminEmail(email) ? true : Boolean(user?.accessApproved);

      return session;
    },
  },
};
