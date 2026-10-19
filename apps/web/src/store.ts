// UI state only (Pinia): what the page shows. Money and outcomes are the server's.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  formatEuro, formatTokenBalance, tokensValueCents,
  type Coins, type PayKey, type PlayerView, type View,
} from '@classic777/shared';

export const useGame = defineStore('game', () => {
  const seat = ref<string | null>(null);
  const view = ref<View | null>(null);
  /** The balance on screen; held back while the reels spin so it never runs ahead of them. */
  const player = ref<PlayerView | null>(null);
  const heldPlayer = ref<PlayerView | null>(null);
  const coins = ref<Coins>(1);
  const busy = ref(false);
  const message = ref('');
  const alert = ref(false);
  const winCents = ref(0);
  const winCoins = ref(0);
  const hitKey = ref<PayKey | null>(null);
  const level = ref(0);
  /** Over the reels when there is nothing to play: closed, maintenance, no seat. */
  const notice = ref<{ text: string; lobby: boolean } | null>(null);

  const playing = computed(() => view.value?.status === 'open' || view.value?.status === 'demo');
  const coinCents = computed(() => view.value?.coinCents ?? 0);
  const allowed = computed<Coins[]>(() => view.value?.coinsAllowed ?? []);
  const betCents = computed(() => coins.value * coinCents.value);

  const balanceText = computed(() => (player.value ? formatTokenBalance(player.value.tokensMicro) : '-- tok'));
  const balanceEuro = computed(() => {
    const p = player.value;
    if (!p) return '';
    const rate = view.value?.rateMicro;
    return formatEuro(rate ? tokensValueCents(p.tokensMicro, rate) : p.tokensValueCents);
  });

  function setMessage(text: string, isAlert = false) {
    message.value = text;
    alert.value = isAlert;
  }

  function setPlayer(p: PlayerView) {
    if (busy.value) heldPlayer.value = p;
    else player.value = p;
  }

  function releasePlayer() {
    if (heldPlayer.value) player.value = heldPlayer.value;
    heldPlayer.value = null;
  }

  /** Keep the bet inside what the limits allow after a control change. */
  function fitBet() {
    const a = allowed.value;
    if (a.length && !a.includes(coins.value)) coins.value = a.filter(c => c < coins.value).pop() ?? a[0];
  }

  return {
    seat, view, player, heldPlayer, coins, busy, message, alert, winCents, winCoins, hitKey, level, notice,
    playing, coinCents, allowed, betCents, balanceText, balanceEuro,
    setMessage, setPlayer, releasePlayer, fitBet,
  };
});
