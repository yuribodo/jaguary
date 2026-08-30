import { AccountRoutesLayout } from "@/components/account-page-shell";

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AccountRoutesLayout>{children}</AccountRoutesLayout>;
}
