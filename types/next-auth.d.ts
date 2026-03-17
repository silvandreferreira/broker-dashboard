import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      accessApproved?: boolean;
    } & DefaultSession["user"];
  }
}

