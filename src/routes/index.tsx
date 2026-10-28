import { createFileRoute } from "@tanstack/react-router";
import { StlCompare } from "@/components/StlCompare";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smile Viewer — Current vs New Smile" },
      { name: "description", content: "Drag and drop before and after clear aligner STL scans to preview the patient's new smile in 3D." },
      { property: "og:title", content: "Smile Viewer — Current vs New Smile" },
      { property: "og:description", content: "Drag and drop before and after clear aligner STL scans to preview the patient's new smile in 3D." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StlCompare,
});
