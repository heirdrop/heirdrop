"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { WalletConnectButton } from "@/components/connect-button"

type NavLink = {
  name: string
  href: string
  external?: boolean
}

const navLinks: NavLink[] = [
  { name: "Home", href: "/" },
  { name: "Grantor", href: "/grantor" },
  { name: "Beneficiary", href: "/beneficiary" },
]

export function Navbar() {
  const pathname = usePathname()
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* Mobile menu button */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/70">
                  <Image
                    src="/icon.png"
                    alt="Heirdrop logo"
                    width={28}
                    height={28}
                    className="h-7 w-7"
                    priority
                  />
                </div>
                <span className="text-lg font-semibold tracking-wide text-foreground">
                  Heirdrop
                </span>
              </div>
              <nav className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className={`flex items-center gap-2 text-base font-semibold tracking-wide transition-colors hover:text-primary ${
                      pathname === link.href ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {link.name}
                    {link.external && <ExternalLink className="h-4 w-4" />}
                  </Link>
                ))}
                <div className="mt-6 pt-6 border-t">
                  <WalletConnectButton />
                </div>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 transition hover:border-primary/60 hover:text-primary"
            aria-label="Heirdrop Home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Image
                src="/icon.png"
                alt="Heirdrop logo"
                width={24}
                height={24}
                className="h-6 w-6"
                priority
              />
            </div>
            <span className="hidden text-lg font-semibold tracking-wide sm:inline-block">
              Heirdrop
            </span>
          </Link>
        </div>
        
        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition-colors hover:text-primary ${
                pathname === link.href ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {link.name}
              {link.external && <ExternalLink className="h-4 w-4" />}
            </Link>
          ))}
          
          <div className="flex items-center gap-3">
            <WalletConnectButton />
          </div>
        </nav>
      </div>
    </header>
  )
}
