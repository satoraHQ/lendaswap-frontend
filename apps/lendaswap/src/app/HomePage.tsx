import {
  type Asset,
  CCTP_DOMAINS,
  getCctpBridgeTokens,
  getUsdt0BridgeTokens,
  isArkade,
  isBridgeOnlyChain,
  isBtc,
  isBtcOnchain,
  isCctpUsdc,
  isLightning,
  isSourceEvmChain,
  type TokenInfo,
  toChainName,
} from "@lendasat/lendaswap-sdk-pure";
import { useAppKit } from "@reown/appkit/react";
import { ArrowDown, ChevronDown, Loader } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useAsync } from "react-use";
import { useAccount, useSwitchChain } from "wagmi";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { isLightningAddress, isLnurl } from "../utils/lightningAddress";
import { api } from "./api";
import { AddressInput } from "./components/AddressInput";
import { AmountInput } from "./components/AmountInput";
import { AssetDropDown } from "./components/AssetDropDown";
import { SupportErrorBanner } from "./components/SupportErrorBanner";
import { upsertCctpInboundSession } from "./db";
import { useGaslessFeature } from "./hooks/useGaslessFeature";
import { type RefreshArgs, useQuote } from "./hooks/useQuote";
import { useTokenBalance } from "./hooks/useTokenBalance";
import {
  evmSmallestToSats,
  gaslessFeeBtc,
  protocolFeeBtc,
  serverNetworkFeeBtc,
  totalFeeBtc,
} from "./utils/quoteUtils";
import { getReferralCode, setReferralCode } from "./utils/referralCode";
import { formatTokenUrl, isEvmToken, parseUrlToken } from "./utils/tokenUtils";
import { useWalletBridge } from "./WalletBridgeContext";

// Build query string from amounts and target address
function buildQueryParams(
  srcAmt?: number,
  tgtAmt?: number,
  address?: string,
): string {
  const params = new URLSearchParams();
  if (srcAmt != null) params.set("sourceAmount", String(srcAmt));
  if (tgtAmt != null) params.set("targetAmount", String(tgtAmt));
  if (address) params.set("address", address);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const DEFAULT_USDC_POLYGON = "polygon:USDC";
const DEFAULT_BTC_LIGHTNING = "lightning:BTC";

/** Check if a source→target pair is a valid swap direction */
function isValidPair(source: TokenInfo, target: TokenInfo): boolean {
  // EVM → EVM: not allowed
  if (isEvmToken(source.chain) && isEvmToken(target.chain)) return false;
  // BTC → BTC: onchain/lightning → arkade, arkade → lightning
  if (isBtc(source) && isBtc(target)) {
    if ((isBtcOnchain(source) || isLightning(source)) && isArkade(target))
      return true;
    if (isArkade(source) && isLightning(target)) return true;
    return false;
  }
  return true;
}

// Valid targets for a given source:
//  - BTC onchain / Lightning → Arkade + all EVM tokens
//  - Arkade → Lightning + all EVM tokens
//  - EVM token → all BTC tokens
function getAvailableTargetAssets(
  btcTokens: TokenInfo[],
  evmTokens: TokenInfo[],
  allTokens: TokenInfo[],
  sourceAsset?: TokenInfo,
): TokenInfo[] {
  const sort = (list: TokenInfo[]) =>
    list.sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Bridge-only tokens (USDC on Base, Optimism, etc.)
  const bridgeTokens = allTokens.filter((t) => isBridgeOnlyChain(t.chain));

  if (!sourceAsset) {
    return sort([...allTokens]);
  }

  if (isBtcOnchain(sourceAsset) || isLightning(sourceAsset)) {
    // Onchain BTC / Lightning → EVM tokens + Arkade + CCTP bridge tokens
    const arkadeTokens = btcTokens.filter((t) => isArkade(t));
    return sort([...evmTokens, ...arkadeTokens, ...bridgeTokens]);
  }

  if (isArkade(sourceAsset)) {
    // Arkade → EVM tokens + Lightning + CCTP bridge tokens
    const lightningTokens = btcTokens.filter((t) => isLightning(t));
    return sort([...evmTokens, ...lightningTokens, ...bridgeTokens]);
  }

  if (isEvmToken(sourceAsset.chain)) {
    return sort([...btcTokens]);
  }

  return sort([...allTokens]);
}

export function HomePage() {
  const navigate = useNavigate();
  const params = useParams<{ sourceToken?: string; targetToken?: string }>();
  const {
    address: connectedAddress,
    isConnected: isWeb3WalletConnected,
    chain: web3WalletConnectedChain,
  } = useAccount();

  const { switchChainAsync } = useSwitchChain();
  const { open: openConnectModal } = useAppKit();
  const { arkAddress, isEmbedded } = useWalletBridge();

  useEffect(() => {
    document.title = "LendaSwap - Lightning-Fast Bitcoin Atomic Swaps";
  }, []);

  // Parse URL params like "lightning:btc" or "polygon:0x1234" into {chain, address}
  const urlSourceToken = params.sourceToken
    ? parseUrlToken(params.sourceToken)
    : undefined;
  const urlTargetToken = params.targetToken
    ? parseUrlToken(params.targetToken)
    : undefined;

  const [searchParams] = useSearchParams();

  // Initialize amounts from URL search params (e.g. ?sourceAmount=100&targetAmount=0.005)
  const [sourceAmount, setSourceAmountState] = useState<number | undefined>(
    () => {
      const v = searchParams.get("sourceAmount");
      return v ? Number(v) : undefined;
    },
  );
  const [targetAmount, setTargetAmountState] = useState<number | undefined>(
    () => {
      const v = searchParams.get("targetAmount");
      return v ? Number(v) : undefined;
    },
  );
  const [isCreatingSwap, setIsCreatingSwap] = useState(false);

  const [lastEditedField, setLastEditedField] = useState<
    "sourceAsset" | "targetAsset"
  >(() => {
    // If only targetAmount is provided via URL, treat it as the edited field
    // so the "target edited → derive source" effect fires correctly
    const hasSrc = searchParams.get("sourceAmount");
    const hasTgt = searchParams.get("targetAmount");
    return !hasSrc && hasTgt ? "targetAsset" : "sourceAsset";
  });
  const [targetAddress, setTargetAddress] = useState<string>(
    () => searchParams.get("address") ?? "",
  );
  const [isAddressValid, setIsAddressValid] = useState(true);
  const [swapError, setSwapError] = useState("");
  const gaslessFeatureEnabled = useGaslessFeature();
  const [gaslessEnabled, setGaslessEnabled] = useState(false);

  // Sync targetAddress from URL when search params change (e.g. user edits URL bar)
  const urlAddress = searchParams.get("address");
  useEffect(() => {
    if (urlAddress != null) {
      setTargetAddress(urlAddress);
    }
  }, [urlAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist referral code: URL param takes priority, then fall back to localStorage.
  // The initializer ensures localStorage is populated synchronously on first mount
  // (before any swap can be triggered). The useEffect handles subsequent in-app
  // navigation that changes ?ref= without a full page reload.
  const urlRef = searchParams.get("ref");
  const [_referralCode] = useState(() => {
    if (urlRef) {
      setReferralCode(urlRef);
      return urlRef;
    }
    return getReferralCode();
  });
  useEffect(() => {
    if (urlRef) {
      setReferralCode(urlRef);
    }
  }, [urlRef]);

  const {
    value: maybeAvailableTokens,
    loading: tokensLoading,
    error: tokensLoadingError,
  } = useAsync(async () => {
    return api.getTokens();
  });

  if (tokensLoadingError) {
    console.error(tokensLoadingError);
  }

  const allAvailableTokens = useMemo(() => {
    const btc = maybeAvailableTokens?.btc_tokens || [];
    const evm = maybeAvailableTokens?.evm_tokens || [];
    // Add USDC on all CCTP bridge destination chains (Base, Optimism, etc.)
    const cctpBridgeTokens = getCctpBridgeTokens();
    // Add USDT0 on all LayerZero OFT bridge destination chains
    const usdt0BridgeTokens = getUsdt0BridgeTokens();
    return [...btc, ...evm, ...cctpBridgeTokens, ...usdt0BridgeTokens];
  }, [maybeAvailableTokens]);

  const sourceAsset = allAvailableTokens.find(
    (t) =>
      t.chain.toLowerCase() === urlSourceToken?.chain.toLowerCase() &&
      t.symbol.toLowerCase() === urlSourceToken?.symbol.toLowerCase(),
  );
  const targetAsset = allAvailableTokens.find(
    (t) =>
      t.chain.toLowerCase() === urlTargetToken?.chain.toLowerCase() &&
      t.symbol.toLowerCase() === urlTargetToken?.symbol.toLowerCase(),
  );

  // ── Target address auto-fill / clear ─────────────────────────────────
  // When the target token type changes (EVM ↔ BTC), clear the address so
  // an EVM address doesn't linger in a BTC field and vice-versa.
  // When switching to an EVM target, auto-fill from the connected wallet.

  const isEvmTarget = targetAsset ? isEvmToken(targetAsset.chain) : false;
  const targetChainKey = targetAsset?.chain;

  const isInitialTargetChainSet = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when target chain changes, not on every dep change
  useEffect(() => {
    if (!targetChainKey) return;

    // On initial page load, preserve any address provided via URL params
    if (!isInitialTargetChainSet.current) {
      isInitialTargetChainSet.current = true;
      if (urlAddress) return;
    }

    if (isEvmTarget) {
      // Switching to an EVM target - auto-fill wallet address
      const maybeWeb3Address = connectedAddress?.toString();
      if (maybeWeb3Address && isWeb3WalletConnected) {
        setTargetAddress(maybeWeb3Address);
      } else {
        setTargetAddress("");
      }
    } else {
      // Switching to a BTC target - clear any stale EVM address
      setTargetAddress("");
    }
  }, [targetChainKey]);

  // Also react to wallet connect/disconnect while target is EVM
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run on wallet connect/disconnect events
  useEffect(() => {
    if (!isEvmTarget) return;
    const maybeWeb3Address = connectedAddress?.toString();
    if (maybeWeb3Address && isWeb3WalletConnected && !targetAddress) {
      setTargetAddress(maybeWeb3Address);
    } else if (!isWeb3WalletConnected && targetAddress === connectedAddress) {
      setTargetAddress("");
    }
  }, [connectedAddress, isWeb3WalletConnected]);

  const availableTargetTokens = getAvailableTargetAssets(
    maybeAvailableTokens?.btc_tokens || [],
    maybeAvailableTokens?.evm_tokens || [],
    allAvailableTokens,
    sourceAsset,
  );

  const [feeExpanded, setFeeExpanded] = useState(false);

  // CCTP-only source detection is now handled entirely inside the SDK:
  // `Client.getQuote` rewrites the chain/token + pads or nets amounts
  // by the CCTPv2 fast-transfer fee, and surfaces the fee via the
  // `quote.bridge_fee` field. We pass the user's actual source asset
  // straight through.
  const sourceTokenId = sourceAsset?.token_id;
  const sourceChain = sourceAsset?.chain;
  const sourceDecimals = sourceAsset?.decimals;
  const isSourceBtc = sourceAsset ? isBtc(sourceAsset) : false;
  const isSourceEvm = sourceAsset ? isEvmToken(sourceAsset.chain) : false;
  // `needsCctpQuoteRewrite` kept for the `createSwap` branch below,
  // which still builds its own Arbitrum-side call + CCTP session.
  const needsCctpQuoteRewrite = sourceAsset
    ? isCctpUsdc(sourceAsset) && !isSourceEvmChain(sourceAsset.chain)
    : false;

  // Reset gasless toggle when source is not EVM
  useEffect(() => {
    if (!isSourceEvm) setGaslessEnabled(false);
  }, [isSourceEvm]);

  const targetTokenId = targetAsset?.token_id;
  const targetChain = targetAsset?.chain;

  const {
    quote,
    isLoading: isLoadingQuote,
    refresh: refreshQuote,
  } = useQuote({
    sourceChain,
    sourceToken: sourceTokenId,
    targetChain,
    targetToken: targetTokenId,
  });

  // Debounced quote fetch - fires 800ms after the last amount change.
  // Uses the user's actual amount so amount-dependent fees (like CCTP bridge
  // fee) are accurate. When the quote resolves, sync the non-pinned side
  // from the authoritative response in the same promise chain so there's no
  // flicker from stale quotes.
  useEffect(() => {
    // Determine which side is pinned and what to send.
    // If neither side has a value, fetch with a small default just to
    // populate the fees/limits panel (skip syncing the opposite side).
    let args: RefreshArgs;
    let syncSide: "source" | "target" | "none";
    if (lastEditedField === "sourceAsset" && sourceAmount && sourceAmount > 0) {
      args = { sourceAmount };
      syncSide = "target";
    } else if (
      lastEditedField === "targetAsset" &&
      targetAmount &&
      targetAmount > 0
    ) {
      args = { targetAmount };
      syncSide = "source";
    } else {
      args = {
        sourceAmount: isSourceBtc ? 10_000 : 10 ** (sourceDecimals ?? 0),
      };
      syncSide = "none";
    }

    let cancelled = false;
    // refresh price after this timer
    const timer = window.setTimeout(() => {
      refreshQuote(args).then((q) => {
        if (cancelled || !q) return;
        if (syncSide === "target") {
          const tgt = Number(q.net_target_amount);
          if (Number.isFinite(tgt)) {
            setTargetAmountState(tgt);
          }
        } else if (syncSide === "source") {
          const src = Number(q.net_source_amount);
          if (Number.isFinite(src)) {
            setSourceAmountState(src);
          }
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    sourceAmount,
    targetAmount,
    lastEditedField,
    isSourceBtc,
    sourceDecimals,
    refreshQuote,
  ]);

  // Debounced sync of amounts + address to URL (avoids navigating on every keystroke)
  const { sourceToken: urlSource, targetToken: urlTarget } = params;
  useEffect(() => {
    if (!urlSource || !urlTarget) return;
    const timeout = setTimeout(() => {
      const path = `/${urlSource}/${urlTarget}`;
      // Only persist the user-edited amount; the other is derived from the quote
      const syncSrcAmt =
        lastEditedField === "sourceAsset" ? sourceAmount : undefined;
      const syncTgtAmt =
        lastEditedField === "targetAsset" ? targetAmount : undefined;
      navigate(
        `${path}${buildQueryParams(syncSrcAmt, syncTgtAmt, targetAddress)}`,
        { replace: true },
      );
    }, 500);
    return () => clearTimeout(timeout);
  }, [
    sourceAmount,
    targetAmount,
    targetAddress,
    lastEditedField,
    urlSource,
    urlTarget,
    navigate,
  ]);

  // Navigate to a new source/target token pair (URL is the source of truth)
  function navigateToTokens(
    source: TokenInfo,
    target: TokenInfo,
    srcAmt?: number,
    tgtAmt?: number,
    address?: string,
  ) {
    const path = `/${formatTokenUrl(source)}/${formatTokenUrl(target)}`;
    // Only persist the user-edited amount; the other is derived from the quote
    const syncSrcAmt =
      lastEditedField === "sourceAsset" ? (srcAmt ?? sourceAmount) : undefined;
    const syncTgtAmt =
      lastEditedField === "targetAsset" ? (tgtAmt ?? targetAmount) : undefined;
    navigate(
      `${path}${buildQueryParams(syncSrcAmt, syncTgtAmt, address ?? targetAddress)}`,
      {
        replace: true,
      },
    );
  }

  const { balance: sourceBalance } = useTokenBalance(sourceAsset);
  const { balance: targetBalance } = useTokenBalance(targetAsset);

  const formatBalance = (balance: bigint | undefined, token: TokenInfo) => {
    if (balance === undefined) return undefined;
    const value = Number(balance) / 10 ** token.decimals;
    return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  };

  const isInitialLoading = tokensLoading;

  // ── EVM chain switching ──────────────────────────────────────────────
  // Determine which EVM chain the current asset pair requires, then
  // auto-switch the wallet. If the switch fails (user rejects, wallet
  // doesn't support it, etc.) we surface a manual fallback button.

  // Only require a chain switch for source EVM chains or target chains that
  // are NOT bridge-only (bridge targets don't need the wallet on that chain -
  // CCTP handles delivery automatically).
  const requiredEvmChain =
    sourceAsset &&
    isEvmToken(sourceAsset.chain) &&
    !isBridgeOnlyChain(sourceAsset.chain)
      ? sourceAsset.chain
      : targetAsset &&
          isEvmToken(targetAsset.chain) &&
          !isBridgeOnlyChain(targetAsset.chain)
        ? targetAsset.chain
        : undefined;

  const requiredChainId = requiredEvmChain
    ? Number(requiredEvmChain)
    : undefined;

  const isWrongChain =
    !gaslessEnabled &&
    requiredChainId !== undefined &&
    web3WalletConnectedChain !== undefined &&
    web3WalletConnectedChain.id !== requiredChainId;

  const [chainSwitchFailed, setChainSwitchFailed] = useState(false);

  const requestChainSwitch = useCallback(() => {
    if (!requiredChainId || !switchChainAsync) return;
    setChainSwitchFailed(false);
    switchChainAsync({ chainId: requiredChainId }).catch(() =>
      setChainSwitchFailed(true),
    );
  }, [requiredChainId, switchChainAsync]);

  // Auto-switch when the required chain changes
  useEffect(() => {
    if (isWrongChain) requestChainSwitch();
  }, [isWrongChain, requestChainSwitch]);

  // Clear failure state once the wallet is on the correct chain
  useEffect(() => {
    if (!isWrongChain) setChainSwitchFailed(false);
  }, [isWrongChain]);

  const requiredChainName = requiredEvmChain && toChainName(requiredEvmChain);

  const createSwap = async () => {
    if (!sourceAsset || !targetAsset) {
      return;
    }

    // CCTP-inbound source (USDC on Base / Optimism / Linea / etc.): the
    // backend doesn't accept these as source chains, so the SDK auto-remaps
    // to Arbitrum USDC and populates `bridge_source_chain` on our behalf.
    // We still persist a local session (swap_id + source chain) for the
    // wizard's BridgingCctpStep - the stored swap now reports the gross
    // burn on the source chain directly via `source_amount`.
    if (
      isCctpUsdc(sourceAsset) &&
      !isSourceEvmChain(sourceAsset.chain) &&
      sourceAmount != null
    ) {
      try {
        setIsCreatingSwap(true);
        setSwapError("");
        const sourceChainName = toChainName(sourceAsset.chain);
        const sourceDomain =
          CCTP_DOMAINS[sourceChainName as keyof typeof CCTP_DOMAINS];
        if (sourceDomain === undefined) {
          throw new Error(`No CCTP domain for source chain ${sourceChainName}`);
        }

        // The BTC variants (Lightning / Arkade / on-chain) all use the literal
        // "btc" token id; reuse `targetAsset.token_id` instead of hard-coding.
        const backendTarget: Asset = {
          chain: targetAsset.chain,
          tokenId: targetAsset.token_id,
        };

        // Lightning addresses / LNURLs are resolved server-side via
        // LNURL-pay and require `targetAmount` (sats). Arkade / onchain
        // BTC swaps keep using the user's source-chain USDC amount.
        const useTargetAmount =
          isLightning(targetAsset) &&
          (isLightningAddress(targetAddress) || isLnurl(targetAddress)) &&
          targetAmount != null;

        const swap = await api.createSwap({
          // `api.createSwap` accepts either `Asset` or `TokenInfo` via
          // `sourceAsset`; we pass the legacy shape so the SDK auto-detects
          // the CCTP-only source and populates `inboundBridgeParams`.
          sourceAsset,
          target: backendTarget,
          ...(useTargetAmount
            ? { targetAmount: Number(targetAmount) }
            : { sourceAmount: Number(sourceAmount) }),
          targetAddress,
          gasless: true,
        });

        // The backend now returns `source_amount` as the gross burn on the
        // source chain (CCTP fee already baked in). Persist it verbatim.
        const burnAmountUsdc = BigInt(swap.source_amount);
        if (burnAmountUsdc <= 0n) {
          throw new Error(
            `Amount too small to cover CCTP fee (burn=${burnAmountUsdc}).`,
          );
        }

        await upsertCctpInboundSession({
          swap_id: swap.id,
          source_chain: sourceChainName,
          source_domain: sourceDomain,
          source_amount: burnAmountUsdc.toString(),
          source_token: formatTokenUrl(sourceAsset),
          target_token: formatTokenUrl(targetAsset),
          target_address: targetAddress,
          phase: "swap_created",
        });

        navigate(`/swap/${swap.id}/wizard`);
      } catch (e) {
        console.error("CCTP-inbound swap creation failed:", e);
        setSwapError(String(e));
      } finally {
        setIsCreatingSwap(false);
      }
      return;
    }

    try {
      setIsCreatingSwap(true);

      let selectedSourceAmount: number | undefined;
      let selectedTargetAmount: number | undefined;
      if (lastEditedField === "sourceAsset") {
        selectedSourceAmount = sourceAmount;
      } else {
        selectedTargetAmount = targetAmount;
      }

      // BTC → Arkade backend requires targetAmount (sats_receive).
      // The quote already computed it, so always pass it through.
      if (
        (isBtcOnchain(sourceAsset) || isLightning(sourceAsset)) &&
        isArkade(targetAsset) &&
        selectedTargetAmount == null
      ) {
        selectedTargetAmount = targetAmount;
      }

      // Lightning addresses (user@domain) and LNURLs are resolved server-side
      // via LNURL-pay and require targetAmount (sats). The quote already
      // computed it, so always pass it through.
      if (
        isLightning(targetAsset) &&
        (isLightningAddress(targetAddress) || isLnurl(targetAddress)) &&
        selectedTargetAmount == null
      ) {
        selectedTargetAmount = targetAmount;
      }

      // Bridge-only chain remapping (e.g. USDC on Base → Arbitrum USDC + CCTP bridge)
      // is handled automatically by the SDK's createSwap method.
      const swap = await api.createSwap({
        sourceAsset,
        targetAsset,
        sourceAmount: selectedSourceAmount,
        targetAmount: selectedTargetAmount,
        targetAddress,
        userAddress: connectedAddress,
        gasless: gaslessEnabled,
      });
      navigate(`/swap/${swap.id}/wizard`);
    } catch (e) {
      console.error(e);
      setSwapError(`${e}`);
    } finally {
      setIsCreatingSwap(false);
    }
  };

  const isWeb3WalletNeeded =
    sourceAsset && isEvmToken(sourceAsset.chain) && !gaslessEnabled;
  const isConnectionStillNeeded = isWeb3WalletNeeded && !isWeb3WalletConnected;

  // Compute the BTC-equivalent amount in sats for limit validation
  // Limits from the quote are always in sats
  const btcAmountSats = useMemo(() => {
    if (!quote) return undefined;
    if (isSourceBtc && sourceAmount != null) {
      return sourceAmount;
    }
    if (!isSourceBtc && targetAmount != null) {
      return targetAmount;
    }
    if (!isSourceBtc && sourceAmount != null) {
      const exchangeRate = Number(quote.exchange_rate);
      if (exchangeRate === 0) return undefined;
      return Math.round(
        evmSmallestToSats(sourceAmount, exchangeRate, sourceDecimals ?? 0),
      );
    }
    return undefined;
  }, [quote, sourceAmount, targetAmount, isSourceBtc, sourceDecimals]);

  const isBelowMin =
    quote != null &&
    btcAmountSats != null &&
    btcAmountSats < quote.min_amount &&
    btcAmountSats > 0;
  const isAboveMax =
    quote != null && btcAmountSats != null && btcAmountSats > quote.max_amount;
  const isOutOfLimits = isBelowMin || isAboveMax;

  // Check if the user has insufficient balance for the source token (EVM only)
  const insufficientBalance =
    sourceBalance !== undefined &&
    sourceAmount != null &&
    sourceAmount > 0 &&
    sourceBalance < BigInt(Math.round(sourceAmount));

  // Skeleton loader for initial loading state
  if (isInitialLoading) {
    return (
      <div className="flex animate-pulse flex-col p-3">
        {/* Sell skeleton */}
        <div className="bg-muted rounded-2xl p-4 pb-5">
          <div className="bg-muted-foreground/20 mb-3 h-4 w-8 rounded" />
          <div className="flex items-center justify-between gap-4">
            <div className="bg-muted-foreground/20 h-10 flex-1 rounded-lg" />
            <div className="bg-muted-foreground/20 h-10 w-28 rounded-full" />
          </div>
        </div>
        {/* Arrow skeleton */}
        <div className="relative z-10 -my-3 flex justify-center">
          <div className="bg-background h-10 w-10 rounded-xl p-1">
            <div className="bg-muted h-full w-full rounded-lg" />
          </div>
        </div>
        {/* Buy skeleton */}
        <div className="bg-muted rounded-2xl p-4 pt-5">
          <div className="bg-muted-foreground/20 mb-3 h-4 w-8 rounded" />
          <div className="flex items-center justify-between gap-4">
            <div className="bg-muted-foreground/20 h-10 flex-1 rounded-lg" />
            <div className="bg-muted-foreground/20 h-10 w-28 rounded-full" />
          </div>
        </div>
        {/* Address skeleton */}
        <div className="bg-muted mt-3 rounded-2xl p-4">
          <div className="bg-muted-foreground/20 mb-3 h-4 w-32 rounded" />
          <div className="bg-muted-foreground/20 h-12 w-full rounded-xl" />
        </div>
        {/* Button skeleton */}
        <div className="bg-muted-foreground/20 mt-3 h-14 w-full rounded-2xl" />
      </div>
    );
  }

  const buttonDisabled =
    !targetAddress ||
    !isAddressValid ||
    isCreatingSwap ||
    isOutOfLimits ||
    insufficientBalance ||
    (!sourceAmount && !targetAmount);

  const gaslessFeeEstimate =
    gaslessFeatureEnabled && quote && gaslessFeeBtc(quote);
  const totalFee = quote && totalFeeBtc(btcAmountSats, quote, gaslessEnabled);
  const networkFee = quote && serverNetworkFeeBtc(quote);
  const protocolFee = quote && protocolFeeBtc(btcAmountSats, quote);

  return (
    <div className="flex flex-col p-3">
      {/* Sell/Buy container with arrow */}
      <div className="relative">
        {/* Sell */}
        <div className="bg-muted group/sell overflow-hidden rounded-2xl p-4 pb-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-muted-foreground text-sm">Sell</div>
            {sourceBalance !== undefined && sourceAsset && (
              <div className="flex gap-1 opacity-0 transition-opacity group-hover/sell:opacity-100">
                {([25, 50, 75, 100] as const).map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setLastEditedField("sourceAsset");
                      const amt = (sourceBalance * BigInt(pct)) / 100n;
                      setSourceAmountState(Number(amt));
                    }}
                    className="bg-background text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full px-2 py-0.5 text-xs transition-colors"
                  >
                    {pct === 100 ? "Max" : `${pct}%`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4">
            <AmountInput
              value={sourceAmount}
              onChange={(value) => {
                setLastEditedField("sourceAsset");
                setSourceAmountState(value);
              }}
              decimals={sourceAsset?.decimals}
              isLoading={isLoadingQuote && lastEditedField !== "sourceAsset"}
              symbol={sourceAsset?.symbol}
              error={insufficientBalance}
            />
            <div className="shrink-0">
              <AssetDropDown
                value={sourceAsset}
                availableAssets={allAvailableTokens.filter(
                  (t) => !isBridgeOnlyChain(t.chain) || isCctpUsdc(t),
                )}
                label="sell"
                onChange={(asset) => {
                  setSwapError("");
                  const src = formatTokenUrl(asset);
                  if (targetAsset && isValidPair(asset, targetAsset)) {
                    navigateToTokens(asset, targetAsset);
                  } else {
                    // Invalid pair or no target - pick a sensible default
                    const defaultTarget = isBtc(asset)
                      ? DEFAULT_USDC_POLYGON
                      : DEFAULT_BTC_LIGHTNING;
                    navigate(`/${src}/${defaultTarget}`, { replace: true });
                  }
                }}
              />
            </div>
          </div>
          <div className="mt-1.5 flex justify-end">
            <span
              className={`text-xs ${insufficientBalance ? "text-destructive" : "text-muted-foreground"}`}
            >
              {sourceAsset && sourceBalance !== undefined
                ? `${formatBalance(sourceBalance, sourceAsset)} ${sourceAsset.symbol}`
                : "\u00A0"}
            </span>
          </div>
        </div>

        {/* Swap button - absolutely positioned (like Uniswap) */}
        <button
          type="button"
          data-no-press
          onClick={() => {
            if (!sourceAsset || !targetAsset) return;
            // btc_onchain can only be in sell position, not buy position
            if (isBtcOnchain(sourceAsset)) return;

            // Swap source and target tokens + amounts
            setSourceAmountState(targetAmount);
            setTargetAmountState(sourceAmount);
            setTargetAddress("");
            navigateToTokens(
              targetAsset,
              sourceAsset,
              targetAmount,
              sourceAmount,
              "",
            );
          }}
          className={`group/swap absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 ${!sourceAsset || isBtcOnchain(sourceAsset) ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <div className="bg-background rounded-xl p-1 transition-transform duration-200 ease-out group-hover/swap:scale-110 group-active/swap:scale-125">
            <div className="bg-muted group-hover/swap:bg-muted/80 rounded-lg p-1.5 transition-colors">
              <ArrowDown className="text-muted-foreground h-5 w-5" />
            </div>
          </div>
        </button>

        {/* Buy */}
        <div className="bg-muted mt-1 overflow-hidden rounded-2xl p-4 pt-5">
          <div className="text-muted-foreground mb-2 text-sm">Buy</div>
          <div className="flex items-center justify-between gap-4">
            <AmountInput
              value={targetAmount}
              onChange={(value) => {
                setLastEditedField("targetAsset");
                setTargetAmountState(value);
              }}
              decimals={targetAsset?.decimals ?? 8}
              isLoading={isLoadingQuote && lastEditedField !== "targetAsset"}
              symbol={targetAsset?.symbol}
            />
            <div className="shrink-0">
              <AssetDropDown
                availableAssets={availableTargetTokens}
                value={targetAsset}
                onChange={(asset) => {
                  setSwapError("");
                  const tgt = formatTokenUrl(asset);
                  if (sourceAsset && isValidPair(sourceAsset, asset)) {
                    navigateToTokens(sourceAsset, asset);
                  } else {
                    // Invalid pair or no source - pick a sensible default
                    const defaultSource = isBtc(asset)
                      ? DEFAULT_USDC_POLYGON
                      : DEFAULT_BTC_LIGHTNING;
                    navigate(`/${defaultSource}/${tgt}`, { replace: true });
                  }
                }}
                label="buy"
              />
            </div>
          </div>
          <div className="mt-1.5 flex justify-end">
            <span className="text-muted-foreground text-xs">
              {targetAsset && targetBalance !== undefined
                ? `${formatBalance(targetBalance, targetAsset)} ${targetAsset.symbol}`
                : "\u00A0"}
            </span>
          </div>
        </div>
      </div>

      {/* Address Input */}

      <div className="pt-3">
        <AddressInput
          value={targetAddress}
          onChange={setTargetAddress}
          targetToken={targetAsset}
          setBitcoinAmount={(amount) => {
            setLastEditedField("targetAsset");
            setTargetAmountState(amount);
          }}
          setAddressIsValid={setIsAddressValid}
          disabled={
            isEmbedded && !!arkAddress && !!targetAsset && isArkade(targetAsset)
          }
          targetAmountSats={
            targetAsset && isBtc(targetAsset) ? targetAmount : undefined
          }
        />
        {/*Fees - below inputs, above Continue button*/}
        {(isLoadingQuote || quote) && (
          <div className="text-muted-foreground/70 space-y-1 pt-2 text-xs">
            {!isLoadingQuote && isBelowMin && (
              <div className="text-destructive">
                Amount too low - minimum is {quote.min_amount.toLocaleString()}{" "}
                sats
              </div>
            )}
            {!isLoadingQuote && isAboveMax && (
              <div className="text-destructive">
                Amount too high - maximum is {quote.max_amount.toLocaleString()}{" "}
                sats
              </div>
            )}
            <div className="flex flex-col items-end space-y-1">
              <button
                type="button"
                className="hover:text-muted-foreground flex items-center gap-0.5 transition-colors"
                onClick={() => setFeeExpanded((v) => !v)}
              >
                Total Fee:{" "}
                {isLoadingQuote ? (
                  <Skeleton className="inline-block h-3 w-20" />
                ) : (
                  <>{totalFee} BTC</>
                )}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${feeExpanded ? "rotate-180" : ""}`}
                />
              </button>
              {feeExpanded && (
                <div className="text-muted-foreground/50 space-y-0.5 text-right">
                  {isLoadingQuote ? (
                    <>
                      <Skeleton className="ml-auto h-3 w-32" />
                      <Skeleton className="ml-auto h-3 w-28" />
                    </>
                  ) : (
                    <>
                      <div>Network Fee: {networkFee} BTC</div>
                      {isSourceEvm && gaslessFeeEstimate && (
                        <div className="flex items-center justify-end gap-1.5">
                          <span>
                            Gasless Fee:{" "}
                            {gaslessEnabled ? gaslessFeeEstimate : "0.00000000"}{" "}
                            BTC
                          </span>
                          <Switch
                            checked={gaslessEnabled}
                            onCheckedChange={setGaslessEnabled}
                            className="scale-75"
                          />
                        </div>
                      )}
                      {quote && (
                        <div>
                          Protocol Fee (
                          {(quote.protocol_fee_rate * 100).toFixed(2)}
                          %): {protocolFee} BTC
                        </div>
                      )}
                      {quote?.bridge_fee != null &&
                        (needsCctpQuoteRewrite ? (
                          <div>
                            CCTP Fee: ~{(quote.bridge_fee / 1e6).toFixed(4)}{" "}
                            USDC (deducted from source amount)
                          </div>
                        ) : (
                          <div>
                            Max Bridge Fee: ~
                            {(quote.bridge_fee / 1e6).toFixed(4)} USDC (deducted
                            from received amount)
                          </div>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="pt-2">
          {isConnectionStillNeeded ? (
            <Button
              onClick={() => openConnectModal().catch(console.error)}
              className="h-12 w-full"
            >
              Connect Wallet
            </Button>
          ) : isWrongChain && chainSwitchFailed ? (
            <Button onClick={requestChainSwitch} className="h-12 w-full">
              Switch to {requiredChainName}
            </Button>
          ) : isWrongChain ? (
            <Button disabled className="h-12 w-full">
              <Loader className="h-4 w-4 animate-spin" />
              Switching Network...
            </Button>
          ) : (
            <Button
              onClick={createSwap}
              disabled={buttonDisabled}
              className="h-12 w-full"
            >
              {isCreatingSwap ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Please Wait
                </>
              ) : insufficientBalance && sourceAsset ? (
                <>Insufficient {sourceAsset.symbol}</>
              ) : (
                <>Continue</>
              )}
            </Button>
          )}
        </div>
        {/*Swap Error Display*/}
        {swapError && (
          <div className="pt-2">
            <SupportErrorBanner
              message="Failed to create swap"
              error={swapError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
