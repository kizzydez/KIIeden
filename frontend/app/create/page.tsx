import { redirect } from "next/navigation";

/// Old manual-baseURI create flow lived here. Replaced by two upload-driven
/// flows; this just forwards old links.
export default function CreateRedirect() {
  redirect("/create/single");
}
