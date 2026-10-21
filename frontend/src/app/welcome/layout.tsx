import { Instrument_Serif } from "next/font/google";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

/** Public marketing surface: loads the display face only for this route. */
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <div className={display.variable}>{children}</div>;
}
