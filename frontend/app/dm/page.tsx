import { DmApp } from "./DmApp";

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  return <DmApp initialWith={sp.with} initialName={sp.name} />;
}
