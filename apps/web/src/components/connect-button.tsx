"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Wallet2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openConnectModal,
        openAccountModal,
        openChainModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading"
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated")

        // Not connected → open wallet modal
        if (!connected) {
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openConnectModal}
              className="rounded-full bg-black text-white hover:bg-black/90 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
            >
              <Wallet2 className="h-4 w-4" />
              <span className="sr-only">Connect wallet</span>
            </Button>
          )
        }

        // Wrong network → open chain modal
        if (chain?.unsupported) {
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openChainModal}
              className="rounded-full bg-black text-white hover:bg-black/90 border border-destructive/60"
            >
              <Wallet2 className="h-4 w-4" />
              <span className="sr-only">Switch network</span>
            </Button>
          )
        }

        // Connected → open account modal
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={openAccountModal}
            className="rounded-full bg-black text-white hover:bg-black/90 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
          >
            <Wallet2 className="h-4 w-4" />
            <span className="sr-only">
              {account?.displayName}
              {account?.displayBalance
                ? ` (${account.displayBalance})`
                : ""}
            </span>
          </Button>
        )
      }}
    </ConnectButton.Custom>
  )
}
