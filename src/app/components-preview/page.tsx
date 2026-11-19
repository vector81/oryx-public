import Link from "next/link";

export default function ComponentsPreview() {
  return (
    <main style={{ maxWidth: 900, margin: "80px auto", padding: 24 }}>
      <h1>Component previews</h1>
      <p>Interactive studies with sample data.</p>
      <ul>
        <li><Link href="/components-preview/liquid-glass-navbar">Liquid Glass Navbar</Link></li>
        <li><Link href="/components-preview/peak-chart">Peak Chart</Link></li>
        <li><Link href="/components-preview/warp-carousel">Warp Carousel</Link></li>
        <li><Link href="/components-preview/glass-folder-cards">Glass Folder Cards</Link></li>
      </ul>
    </main>
  );
}
