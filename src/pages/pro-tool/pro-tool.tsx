// TradeUiClone.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useLocation } from 'react-router-dom';
import { ArrowUp, ArrowDown, Hash, Sigma, Dice5, Play, StopCircle, Trash2, Scan, Home, RefreshCw, Shield, Zap, Eye, Anchor, Download, Upload, X, Users, MessageCircle, MessageSquare, Youtube, Instagram, Music } from "lucide-react";
import { generateDerivApiInstance, V2GetActiveClientId, V2GetActiveToken } from '@/external/bot-skeleton/services/api/appId';
import { tradeOptionToBuy } from '@/external/bot-skeleton/services/tradeEngine/utils/helpers';
import { useStore } from '@/hooks/useStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import './pro-scanner-bot.scss';

// Types
interface LogEntry {
  id: number;
  time: string;
  market: 'M1' | 'M2' | 'VH';
  symbol: string;
  contract: string;
  stake: number;
  martingaleStep: number;
  exitDigit: string;
  result: 'Win' | 'Loss' | 'Pending' | 'V-Win' | 'V-Loss';
  pnl: number;
  balance: number;
  switchInfo: string;
}

interface BotConfig {
  version: number;
  botName?: string;
  m1: {
    enabled: boolean;
    symbol: string;
    contract: string;
    barrier: string;
    hookEnabled: boolean;
    virtualLossCount: string;
    realCount: string;
  };
  m2: {
    enabled: boolean;
    symbol: string;
    contract: string;
    barrier: string;
    hookEnabled: boolean;
    virtualLossCount: string;
    realCount: string;
  };
  risk: {
    stake: string;
    martingaleOn: boolean;
    martingaleMultiplier: string;
    martingaleMaxSteps: string;
    takeProfit: string;
    stopLoss: string;
  };
  strategy: {
    m1Enabled: boolean;
    m2Enabled: boolean;
    m1Mode: 'pattern' | 'digit';
    m2Mode: 'pattern' | 'digit';
    m1Pattern: string;
    m1DigitCondition: string;
    m1DigitCompare: string;
    m1DigitWindow: string;
    m2Pattern: string;
    m2DigitCondition: string;
    m2DigitCompare: string;
    m2DigitWindow: string;
  };
  scanner: { active: boolean };
  turbo: { enabled: boolean };
}

type BotStatus = 'idle' | 'trading_m1' | 'recovery' | 'waiting_pattern' | 'pattern_matched' | 'virtual_hook' | 'reconnecting';

const SCANNER_MARKETS: { symbol: string; name: string }[] = [
  { symbol: 'R_10', name: 'Vol 10' }, { symbol: 'R_25', name: 'Vol 25' }, { symbol: 'R_50', name: 'Vol 50' },
  { symbol: 'R_75', name: 'Vol 75' }, { symbol: 'R_100', name: 'Vol 100' }, { symbol: '1HZ10V', name: 'V10 1s' },
  { symbol: '1HZ15V', name: 'V15 1s' }, { symbol: '1HZ25V', name: 'V25 1s' }, { symbol: '1HZ30V', name: 'V30 1s' },
  { symbol: '1HZ50V', name: 'V50 1s' }, { symbol: '1HZ75V', name: 'V75 1s' }, { symbol: '1HZ90V', name: 'V90 1s' },
  { symbol: '1HZ100V', name: 'V100 1s' }, { symbol: 'JD10', name: 'Jump 10' }, { symbol: 'JD25', name: 'Jump 25' },
  { symbol: 'RDBEAR', name: 'Bear' }, { symbol: 'RDBULL', name: 'Bull' },
];

const CONTRACT_TYPES = [
  'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER',
] as const;

const needsBarrier = (ct: string) => ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(ct);

// Helper Functions
const getLastDigit = (quote: number): number => Math.abs(Math.floor(quote)) % 10;

class CircularTickBuffer {
  private buffer: { digit: number; ts: number }[];
  private head = 0;
  private count = 0;
  constructor(private capacity = 1000) { this.buffer = new Array(capacity); }
  push(digit: number) { this.buffer[this.head] = { digit, ts: performance.now() }; this.head = (this.head + 1) % this.capacity; if (this.count < this.capacity) this.count++; }
  last(n: number): number[] { const result: number[] = []; const start = (this.head - Math.min(n, this.count) + this.capacity) % this.capacity; for (let i = 0; i < Math.min(n, this.count); i++) result.push(this.buffer[(start + i) % this.capacity].digit); return result; }
  get size() { return this.count; }
}

// Social Notification Popup Component
const SocialNotificationPopup = ({ onClose }: { onClose: () => void }) => {
  const [isExiting, setIsExiting] = useState(false);
  const handleClose = () => { setIsExiting(true); setTimeout(onClose, 300); };
  const socialLinks = [
    { name: 'WhatsApp', url: 'https://wa.me/+254794944129', icon: <MessageCircle className="w-4 h-4" />, color: 'hover:text-[#25D366]', bgGradient: 'from-green-500/20 to-green-600/20' },
    { name: 'Telegram Group', url: 'https://t.me/yourgroup', icon: <MessageSquare className="w-4 h-4" />, color: 'hover:text-[#26A5E4]', bgGradient: 'from-blue-500/20 to-blue-600/20' },
    { name: 'Telegram Channel', url: 'https://t.me/yourchannel', icon: <MessageSquare className="w-4 h-4" />, color: 'hover:text-[#26A5E4]', bgGradient: 'from-blue-500/20 to-blue-600/20' },
    { name: 'YouTube', url: 'https://youtube.com/@yourchannel', icon: <Youtube className="w-4 h-4" />, color: 'hover:text-[#FF0000]', bgGradient: 'from-red-500/20 to-red-600/20' },
    { name: 'TikTok', url: 'https://www.tiktok.com/@yourprofile', icon: <Music className="w-4 h-4" />, color: 'hover:text-foreground', bgGradient: 'from-gray-500/20 to-gray-600/20' },
    { name: 'Instagram', url: 'https://www.instagram.com/yourprofile', icon: <Instagram className="w-4 h-4" />, color: 'hover:text-[#E4405F]', bgGradient: 'from-pink-500/20 to-pink-600/20' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`w-[500px] max-w-[90vw] bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-white/20 transition-all duration-300 ${isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        <div className="relative p-6 text-center">
          <button onClick={handleClose} className="absolute top-3 right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-4 h-4" /></button>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg"><Users className="w-8 h-8 text-white" /></div>
          <h2 className="text-xl font-bold text-white mb-2">Join Our Trading Community</h2>
          <p className="text-sm text-white/80 mb-4">Connect & Grow Together</p>
          <p className="text-xs text-white/60 mb-6">Connect with fellow traders! Share your trading experiences, strategies, and get the latest updates on new features and classes.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {socialLinks.map((social) => (
              <a key={social.name} href={social.url} target="_blank" rel="noopener noreferrer" onClick={handleClose} className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white transition-all duration-300 hover:scale-105 ${social.color}`}>
                <div className={`p-1.5 rounded-lg bg-gradient-to-r ${social.bgGradient}`}>{social.icon}</div>
                <span className="text-xs font-medium">{social.name}</span>
              </a>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleClose} className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition">NO THANKS</button>
            <button onClick={handleClose} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-sm font-semibold transition shadow-lg">MAYBE LATER</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// TP/SL Notification Component
const TPSLNotificationPopup = () => {
  const [notification, setNotification] = useState<{ type: 'tp' | 'sl'; message: string; amount?: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  useEffect(() => {
    (window as any).showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
      setNotification({ type, message, amount }); setIsVisible(true); setIsExiting(false);
      const timeout = setTimeout(() => handleClose(), 8000);
      return () => clearTimeout(timeout);
    };
    return () => { delete (window as any).showTPNotification; };
  }, []);
  const handleClose = () => { setIsExiting(true); setTimeout(() => { setIsVisible(false); setNotification(null); setIsExiting(false); }, 300); };
  if (!isVisible || !notification) return null;
  const isTP = notification.type === 'tp';
  const amount = notification.amount;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className={`pointer-events-auto w-80 bg-gradient-to-br ${isTP ? 'from-emerald-600 to-emerald-800' : 'from-rose-600 to-rose-800'} rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${isExiting ? 'opacity-0 translate-y-10' : 'opacity-100 translate-y-0'}`}>
        <div className="p-4 text-center">
          <div className="text-3xl mb-2">{isTP ? '🎉' : '😢'}</div>
          <h3 className="text-lg font-bold text-white">{isTP ? 'TAKE PROFIT!' : 'STOP LOSS!'}</h3>
          <p className="text-white/80 text-sm my-2">{notification.message}</p>
          {amount && <p className={`text-2xl font-bold ${isTP ? 'text-emerald-200' : 'text-rose-200'}`}>{isTP ? '+' : '-'}${Math.abs(amount).toFixed(2)}</p>}
          <button onClick={handleClose} className="mt-3 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-semibold transition">OK</button>
        </div>
      </div>
    </div>
  );
};

// Main Pro Scanner Bot Component
const ProScannerBot = () => {
  const { transactions } = useStore();
  const apiRef = useRef<any>(null);
  const tickStreamIdRef = useRef<string | null>(null);
  const location = useLocation();
  
  // Bot State
  const [m1Enabled, setM1Enabled] = useState(true);
  const [m1Contract, setM1Contract] = useState('DIGITEVEN');
  const [m1Barrier, setM1Barrier] = useState('5');
  const [m1Symbol, setM1Symbol] = useState('R_100');
  const [m2Enabled, setM2Enabled] = useState(true);
  const [m2Contract, setM2Contract] = useState('DIGITODD');
  const [m2Barrier, setM2Barrier] = useState('5');
  const [m2Symbol, setM2Symbol] = useState('R_50');
  const [m1HookEnabled, setM1HookEnabled] = useState(false);
  const [m1VirtualLossCount, setM1VirtualLossCount] = useState('3');
  const [m1RealCount, setM1RealCount] = useState('2');
  const [m2HookEnabled, setM2HookEnabled] = useState(false);
  const [m2VirtualLossCount, setM2VirtualLossCount] = useState('3');
  const [m2RealCount, setM2RealCount] = useState('2');
  const [vhFakeWins, setVhFakeWins] = useState(0);
  const [vhFakeLosses, setVhFakeLosses] = useState(0);
  const [vhConsecLosses, setVhConsecLosses] = useState(0);
  const [vhStatus, setVhStatus] = useState<'idle' | 'waiting' | 'confirmed' | 'failed'>('idle');
  const [stake, setStake] = useState('0.6');
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState('2.0');
  const [martingaleMaxSteps, setMartingaleMaxSteps] = useState('5');
  const [takeProfit, setTakeProfit] = useState('5');
  const [stopLoss, setStopLoss] = useState('30');
  const [strategyEnabled, setStrategyEnabled] = useState(false);
  const [strategyM1Enabled, setStrategyM1Enabled] = useState(false);
  const [m1StrategyMode, setM1StrategyMode] = useState<'pattern' | 'digit'>('pattern');
  const [m2StrategyMode, setM2StrategyMode] = useState<'pattern' | 'digit'>('pattern');
  const [m1Pattern, setM1Pattern] = useState('');
  const [m1DigitCondition, setM1DigitCondition] = useState('==');
  const [m1DigitCompare, setM1DigitCompare] = useState('5');
  const [m1DigitWindow, setM1DigitWindow] = useState('3');
  const [m2Pattern, setM2Pattern] = useState('');
  const [m2DigitCondition, setM2DigitCondition] = useState('==');
  const [m2DigitCompare, setM2DigitCompare] = useState('5');
  const [m2DigitWindow, setM2DigitWindow] = useState('3');
  const [scannerActive, setScannerActive] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const [botName, setBotName] = useState('');
  const [turboLatency, setTurboLatency] = useState(0);
  const [ticksCaptured, setTicksCaptured] = useState(0);
  const [ticksMissed, setTicksMissed] = useState(0);
  const turboBuffersRef = useRef<Map<string, CircularTickBuffer>>(new Map());
  const [botStatus, setBotStatus] = useState<BotStatus>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const [currentMarket, setCurrentMarket] = useState<1 | 2>(1);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [totalStaked, setTotalStaked] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [currentStake, setCurrentStakeState] = useState(0);
  const [martingaleStep, setMartingaleStepState] = useState(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const [localBalance, setLocalBalance] = useState(10000);
  const [accountCurrency, setAccountCurrency] = useState('USD');
  const [lastDigit, setLastDigit] = useState<number | null>(null);
  const [digits, setDigits] = useState<number[]>([]);
  const tickMapRef = useRef<Map<string, number[]>>(new Map());
  const [tickCounts, setTickCounts] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const connectionRetryCountRef = useRef(0);
  const MAX_CONNECTION_RETRIES = 3;
  const shouldStopRef = useRef(false);
  const patternTradeTakenRef = useRef(false);
  const [showSocialPopup, setShowSocialPopup] = useState(false);

  // API Initialization
  useEffect(() => {
    const initApi = async () => {
      const api = generateDerivApiInstance();
      apiRef.current = api;
      try {
        const token = V2GetActiveToken();
        const clientId = V2GetActiveClientId();
        if (token && clientId) {
          const { authorize, error } = await api.authorize(token);
          if (!error && authorize) {
            setAccountCurrency(authorize.currency || 'USD');
            setLocalBalance(authorize.balance || 10000);
            setIsConnected(true);
          }
        }
        setupTickSubscription('R_100');
      } catch (err) { console.error('API init error:', err); }
    };
    initApi();
    return () => { if (apiRef.current) apiRef.current.disconnect?.(); };
  }, []);
  
  const setupTickSubscription = async (symbol: string) => {
    if (!apiRef.current) return;
    try {
      if (tickStreamIdRef.current) await apiRef.current.forget({ forget: tickStreamIdRef.current });
      const { subscription } = await apiRef.current.send({ ticks: symbol, subscribe: 1 });
      if (subscription?.id) tickStreamIdRef.current = subscription.id;
      const onMessage = (data: any) => {
        if (data?.msg_type === 'tick' && data?.tick?.symbol === symbol) {
          const quote = data.tick.quote;
          const digit = getLastDigit(quote);
          setLastDigit(digit);
          setDigits(prev => [...prev.slice(-8), digit]);
          setTicksCaptured(prev => prev + 1);
          const map = tickMapRef.current;
          const arr = map.get(symbol) || [];
          arr.push(digit);
          if (arr.length > 200) arr.shift();
          map.set(symbol, arr);
          setTickCounts(prev => ({ ...prev, [symbol]: arr.length }));
        }
      };
      apiRef.current.connection?.addEventListener('message', onMessage);
    } catch (err) { console.error('Tick subscription error:', err); }
  };
  
  const updateBalanceImmediately = useCallback(async (pnl?: number): Promise<number> => {
    if (pnl !== undefined) { setLocalBalance(prev => prev + pnl); return localBalance + pnl; }
    return localBalance;
  }, [localBalance]);
  
  const ensureConnection = useCallback(async (): Promise<boolean> => {
    if (apiRef.current?.isConnected?.()) { setIsConnected(true); connectionRetryCountRef.current = 0; return true; }
    setBotStatus('reconnecting');
    for (let i = 0; i < MAX_CONNECTION_RETRIES; i++) {
      try {
        const token = V2GetActiveToken();
        if (token) { const { authorize } = await apiRef.current.authorize(token); if (authorize) { setIsConnected(true); setBotStatus('trading_m1'); return true; } }
        await new Promise(r => setTimeout(r, 3000));
      } catch (error) { console.error(`Reconnection attempt ${i + 1} failed:`, error); }
    }
    setIsConnected(false); setBotStatus('idle'); return false;
  }, []);
  
  const checkPatternMatchWith = useCallback((symbol: string, cleanPat: string): boolean => {
    const digits = tickMapRef.current.get(symbol) || [];
    if (digits.length < cleanPat.length) return false;
    const recent = digits.slice(-cleanPat.length);
    for (let i = 0; i < cleanPat.length; i++) {
      const expected = cleanPat[i];
      const actual = recent[i] % 2 === 0 ? 'E' : 'O';
      if (expected !== actual) return false;
    }
    return true;
  }, []);
  
  const checkDigitConditionWith = useCallback((symbol: string, condition: string, compare: string, window: string): boolean => {
    const digits = tickMapRef.current.get(symbol) || [];
    const win = parseInt(window) || 3;
    const comp = parseInt(compare);
    if (digits.length < win) return false;
    const recent = digits.slice(-win);
    return recent.every(d => {
      switch (condition) {
        case '>': return d > comp; case '<': return d < comp; case '>=': return d >= comp;
        case '<=': return d <= comp; case '==': return d === comp; default: return false;
      }
    });
  }, []);
  
  const checkStrategyForMarket = useCallback((symbol: string, market: 1 | 2): boolean => {
    const mode = market === 1 ? m1StrategyMode : m2StrategyMode;
    if (mode === 'pattern') {
      const pat = market === 1 ? m1Pattern.toUpperCase().replace(/[^EO]/g, '') : m2Pattern.toUpperCase().replace(/[^EO]/g, '');
      return checkPatternMatchWith(symbol, pat);
    }
    const cond = market === 1 ? m1DigitCondition : m2DigitCondition;
    const comp = market === 1 ? m1DigitCompare : m2DigitCompare;
    const win = market === 1 ? m1DigitWindow : m2DigitWindow;
    return checkDigitConditionWith(symbol, cond, comp, win);
  }, [m1StrategyMode, m2StrategyMode, m1Pattern, m2Pattern, checkPatternMatchWith, checkDigitConditionWith, m1DigitCondition, m1DigitCompare, m1DigitWindow, m2DigitCondition, m2DigitCompare, m2DigitWindow]);
  
  const findScannerMatchForMarket = useCallback((market: 1 | 2): string | null => {
    for (const m of SCANNER_MARKETS) if (checkStrategyForMarket(m.symbol, market)) return m.symbol;
    return null;
  }, [checkStrategyForMarket]);
  
  const waitForNextTick = useCallback((symbol: string): Promise<{ quote: number }> => new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ quote: 0 }), 5000);
    const onMessage = (data: any) => { if (data?.msg_type === 'tick' && data?.tick?.symbol === symbol) { clearTimeout(timeout); resolve({ quote: data.tick.quote }); } };
    apiRef.current?.connection?.addEventListener('message', onMessage);
    setTimeout(() => apiRef.current?.connection?.removeEventListener('message', onMessage), 5000);
  }), []);
  
  const simulateVirtualContract = useCallback(async (contractType: string, barrier: string, symbol: string): Promise<{ won: boolean; digit: number }> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Virtual contract timeout')), 5000);
    const onMessage = (data: any) => {
      if (data?.msg_type === 'tick' && data?.tick?.symbol === symbol) {
        clearTimeout(timeout);
        const digit = getLastDigit(data.tick.quote);
        const b = parseInt(barrier) || 0;
        let won = false;
        switch (contractType) {
          case 'DIGITEVEN': won = digit % 2 === 0; break;
          case 'DIGITODD': won = digit % 2 !== 0; break;
          case 'DIGITMATCH': won = digit === b; break;
          case 'DIGITDIFF': won = digit !== b; break;
          case 'DIGITOVER': won = digit > b; break;
          case 'DIGITUNDER': won = digit < b; break;
        }
        resolve({ won, digit });
      }
    };
    apiRef.current?.connection?.addEventListener('message', onMessage);
    setTimeout(() => apiRef.current?.connection?.removeEventListener('message', onMessage), 5000);
  }), []);
  
  const purchaseContract = useCallback(async (params: any): Promise<any> => {
    if (!apiRef.current) throw new Error('API not initialized');
    const buy_req = tradeOptionToBuy(params.contract_type, {
      amount: params.amount, basis: 'stake', contractTypes: [params.contract_type], currency: accountCurrency,
      duration: 1, duration_unit: 't', symbol: params.symbol, ...(params.barrier && { barrier: params.barrier })
    });
    const { buy, error } = await apiRef.current.buy(buy_req);
    if (error) throw error;
    try {
      transactions.onBotContractEvent({
        contract_id: buy?.contract_id, transaction_ids: { buy: buy?.transaction_id }, buy_price: buy?.buy_price,
        currency: accountCurrency, contract_type: params.contract_type, underlying: params.symbol,
        date_start: Math.floor(Date.now() / 1000), status: 'open',
      } as any);
    } catch {}
    return { contractId: buy?.contract_id, buy };
  }, [accountCurrency, transactions]);
  
  const waitForContractResult = useCallback(async (contractId: string): Promise<{ status: string; profit: number; sellPrice: number }> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Contract result timeout')), 60000);
    const checkResult = async () => {
      try {
        const { proposal_open_contract } = await apiRef.current?.send({ proposal_open_contract: 1, contract_id: contractId });
        if (proposal_open_contract?.is_sold) {
          clearTimeout(timeout);
          resolve({ status: proposal_open_contract.status === 'sold' && (proposal_open_contract.profit || 0) > 0 ? 'won' : 'lost', profit: proposal_open_contract.profit || 0, sellPrice: proposal_open_contract.sell_price || 0 });
        } else setTimeout(checkResult, 1000);
      } catch (err) { setTimeout(checkResult, 1000); }
    };
    checkResult();
  }), []);
  
  const executeRealTrade = useCallback(async (cfg: any, tradeSymbol: string, cStake: number, mStep: number, mkt: 1 | 2, currentBalance: number, currentPnl: number, baseStake: number) => {
    if (!apiRef.current?.isConnected?.()) { const connected = await ensureConnection(); if (!connected) throw new Error('No connection available'); }
    const logId = ++logIdRef.current;
    const now = new Date().toLocaleTimeString();
    setTotalStaked(prev => prev + cStake);
    setCurrentStakeState(cStake);
    setLogEntries(prev => [{ id: logId, time: now, market: mkt === 1 ? 'M1' : 'M2', symbol: tradeSymbol, contract: cfg.contract, stake: cStake, martingaleStep: mStep, exitDigit: '...', result: 'Pending', pnl: 0, balance: currentBalance, switchInfo: '', }, ...prev].slice(0, 100));
    let inRecovery = mkt === 2;
    let updatedBalance = currentBalance;
    let updatedPnl = currentPnl;
    let won = false;
    try {
      if (!turboMode) await waitForNextTick(tradeSymbol);
      const buyParams: any = { contract_type: cfg.contract, symbol: tradeSymbol, amount: cStake };
      if (needsBarrier(cfg.contract)) buyParams.barrier = cfg.barrier;
      const { contractId } = await purchaseContract(buyParams);
      const result = await waitForContractResult(contractId);
      won = result.status === 'won';
      const pnl = result.profit;
      updatedPnl = currentPnl + pnl;
      updatedBalance = currentBalance + pnl;
      setLocalBalance(updatedBalance);
      setNetProfit(updatedPnl);
      updateBalanceImmediately(pnl);
      const exitDigit = String(getLastDigit(result.sellPrice || 0));
      let switchInfo = '';
      let newCStake = cStake;
      let newMStep = mStep;
      let newInRecovery = inRecovery;
      if (won) { setWins(prev => prev + 1); newInRecovery = false; switchInfo = inRecovery ? '✓ Recovery WIN → Back to M1' : '→ Continue M1'; newMStep = 0; newCStake = baseStake; }
      else { setLosses(prev => prev + 1); if (!inRecovery && m2Enabled) { newInRecovery = true; switchInfo = '✗ Loss → Switch to M2'; } else switchInfo = inRecovery ? '→ Stay M2' : '→ Continue M1'; if (martingaleOn) { const maxS = parseInt(martingaleMaxSteps) || 5; if (mStep < maxS) { newCStake = parseFloat((cStake * (parseFloat(martingaleMultiplier) || 2)).toFixed(2)); newMStep++; } else { newMStep = 0; newCStake = baseStake; } } }
      setMartingaleStepState(newMStep);
      setCurrentStakeState(newCStake);
      setLogEntries(prev => prev.map(e => e.id === logId ? { ...e, exitDigit, result: won ? 'Win' : 'Loss', pnl, balance: updatedBalance, switchInfo } : e));
      let shouldBreak = false;
      const tpValue = parseFloat(takeProfit);
      const slValue = parseFloat(stopLoss);
      if (updatedPnl >= tpValue) { (window as any).showTPNotification?.('tp', `Take Profit Target Hit!`, updatedPnl); shouldBreak = true; shouldStopRef.current = true; }
      if (updatedPnl <= -slValue) { (window as any).showTPNotification?.('sl', `Stop Loss Target Hit!`, Math.abs(updatedPnl)); shouldBreak = true; shouldStopRef.current = true; }
      if (updatedBalance < newCStake) { shouldBreak = true; shouldStopRef.current = true; }
      return { localPnl: updatedPnl, localBalance: updatedBalance, cStake: newCStake, mStep: newMStep, inRecovery: newInRecovery, shouldBreak, won };
    } catch (err: any) { console.error('Trade execution error:', err); setLogEntries(prev => prev.map(e => e.id === logId ? { ...e, result: 'Loss', pnl: 0, exitDigit: '-', switchInfo: `Error: ${err.message}` } : e)); return { localPnl: updatedPnl, localBalance: updatedBalance, cStake, mStep, inRecovery, shouldBreak: false, won: false }; }
  }, [turboMode, waitForNextTick, purchaseContract, waitForContractResult, updateBalanceImmediately, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, m2Enabled, ensureConnection]);
  
  const startBot = useCallback(async () => {
    if (isRunning) return;
    const connected = await ensureConnection();
    if (!connected) return;
    const baseStake = parseFloat(stake);
    if (baseStake < 0.35) return;
    if (!m1Enabled && !m2Enabled) return;
    shouldStopRef.current = false;
    setIsRunning(true);
    runningRef.current = true;
    setCurrentMarket(1);
    setBotStatus('trading_m1');
    setCurrentStakeState(baseStake);
    setMartingaleStepState(0);
    setVhFakeWins(0);
    setVhFakeLosses(0);
    setVhConsecLosses(0);
    setVhStatus('idle');
    setNetProfit(0);
    patternTradeTakenRef.current = false;
    let cStake = baseStake;
    let mStep = 0;
    let inRecovery = false;
    let currentPnl = 0;
    let currentBalanceLocal = localBalance;
    const getConfig = (market: 1 | 2) => ({ contract: market === 1 ? m1Contract : m2Contract, barrier: market === 1 ? m1Barrier : m2Barrier, symbol: market === 1 ? m1Symbol : m2Symbol });
    while (runningRef.current && !shouldStopRef.current) {
      if (currentPnl >= parseFloat(takeProfit) || currentPnl <= -parseFloat(stopLoss)) { shouldStopRef.current = true; break; }
      if (!apiRef.current?.isConnected?.()) { const reconnected = await ensureConnection(); if (!reconnected) break; }
      const mkt: 1 | 2 = inRecovery ? 2 : 1;
      setCurrentMarket(mkt);
      if (mkt === 1 && !m1Enabled) { if (m2Enabled) { inRecovery = true; continue; } else break; }
      if (mkt === 2 && !m2Enabled) { inRecovery = false; continue; }
      let tradeSymbol: string;
      const cfg = getConfig(mkt);
      const hookEnabled = mkt === 1 ? m1HookEnabled : m2HookEnabled;
      const requiredLosses = parseInt(mkt === 1 ? m1VirtualLossCount : m2VirtualLossCount) || 3;
      const realCount = parseInt(mkt === 1 ? m1RealCount : m2RealCount) || 2;
      if ((mkt === 2 && strategyEnabled) || (mkt === 1 && strategyM1Enabled)) patternTradeTakenRef.current = false;
      if (inRecovery && strategyEnabled) {
        setBotStatus('waiting_pattern');
        let matched = false;
        let matchedSymbol = '';
        let attempts = 0;
        const MAX_ATTEMPTS = 100;
        while (runningRef.current && !matched && attempts < MAX_ATTEMPTS && !shouldStopRef.current) {
          if (scannerActive) { const found = findScannerMatchForMarket(2); if (found) { matched = true; matchedSymbol = found; } }
          else { if (checkStrategyForMarket(cfg.symbol, 2)) { matched = true; matchedSymbol = cfg.symbol; } }
          if (!matched) { await new Promise(r => setTimeout(r, 100)); attempts++; }
        }
        if (!runningRef.current || !matched || shouldStopRef.current) continue;
        setBotStatus('pattern_matched');
        tradeSymbol = matchedSymbol;
        await new Promise(r => setTimeout(r, 300));
      } else if (!inRecovery && strategyM1Enabled) {
        setBotStatus('waiting_pattern');
        let matched = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 100;
        while (runningRef.current && !matched && attempts < MAX_ATTEMPTS && !shouldStopRef.current) {
          if (checkStrategyForMarket(cfg.symbol, 1)) matched = true;
          if (!matched) { await new Promise(r => setTimeout(r, 100)); attempts++; }
        }
        if (!runningRef.current || !matched || shouldStopRef.current) continue;
        setBotStatus('pattern_matched');
        tradeSymbol = cfg.symbol;
        await new Promise(r => setTimeout(r, 300));
      } else { setBotStatus(mkt === 1 ? 'trading_m1' : 'recovery'); tradeSymbol = cfg.symbol; }
      if (shouldStopRef.current) break;
      if (((inRecovery && strategyEnabled) || (!inRecovery && strategyM1Enabled)) && patternTradeTakenRef.current) { patternTradeTakenRef.current = false; continue; }
      if (hookEnabled) {
        setBotStatus('virtual_hook');
        setVhStatus('waiting');
        setVhFakeWins(0); setVhFakeLosses(0); setVhConsecLosses(0);
        let consecLosses = 0;
        let virtualTradeNum = 0;
        while (consecLosses < requiredLosses && runningRef.current && !shouldStopRef.current) {
          virtualTradeNum++;
          const vLogId = ++logIdRef.current;
          const vNow = new Date().toLocaleTimeString();
          setLogEntries(prev => [{ id: vLogId, time: vNow, market: 'VH', symbol: tradeSymbol, contract: cfg.contract, stake: 0, martingaleStep: 0, exitDigit: '...', result: 'Pending', pnl: 0, balance: currentBalanceLocal, switchInfo: `Virtual #${virtualTradeNum} (losses: ${consecLosses}/${requiredLosses})`, }, ...prev].slice(0, 100));
          try {
            const vResult = await simulateVirtualContract(cfg.contract, cfg.barrier, tradeSymbol);
            if (!runningRef.current || shouldStopRef.current) break;
            if (vResult.won) { consecLosses = 0; setVhConsecLosses(0); setVhFakeWins(prev => prev + 1); setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, exitDigit: String(vResult.digit), result: 'V-Win', switchInfo: `Virtual WIN → Losses reset (0/${requiredLosses})` } : e)); }
            else { consecLosses++; setVhConsecLosses(consecLosses); setVhFakeLosses(prev => prev + 1); setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, exitDigit: String(vResult.digit), result: 'V-Loss', switchInfo: `Virtual LOSS (${consecLosses}/${requiredLosses})` } : e)); }
          } catch (err) { console.error('Virtual simulation error:', err); setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, result: 'V-Loss', exitDigit: '-', switchInfo: `Error: ${err}` } : e)); break; }
        }
        if (!runningRef.current || shouldStopRef.current) break;
        setVhStatus('confirmed');
        let winOccurred = false;
        for (let ri = 0; ri < realCount && runningRef.current && !winOccurred && !shouldStopRef.current; ri++) {
          const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalanceLocal, currentPnl, baseStake);
          if (!result || !runningRef.current) break;
          currentPnl = result.localPnl; currentBalanceLocal = result.localBalance; cStake = result.cStake; mStep = result.mStep; inRecovery = result.inRecovery;
          if (result.shouldBreak) { shouldStopRef.current = true; runningRef.current = false; break; }
          if (result.won) { winOccurred = true; const winLogId = ++logIdRef.current; setLogEntries(prev => [{ id: winLogId, time: new Date().toLocaleTimeString(), market: 'VH', symbol: tradeSymbol, contract: cfg.contract, stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Pending', pnl: 0, balance: currentBalanceLocal, switchInfo: `✅ REAL WIN DETECTED! Immediate exit from hook mode.` }, ...prev].slice(0, 100)); break; }
        }
        setVhStatus('idle'); setVhConsecLosses(0);
        if ((inRecovery && strategyEnabled) || (!inRecovery && strategyM1Enabled)) patternTradeTakenRef.current = true;
        if (!runningRef.current || shouldStopRef.current) break;
        continue;
      }
      const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalanceLocal, currentPnl, baseStake);
      if (!result || !runningRef.current) break;
      currentPnl = result.localPnl; currentBalanceLocal = result.localBalance; cStake = result.cStake; mStep = result.mStep; inRecovery = result.inRecovery;
      if (result.shouldBreak) { shouldStopRef.current = true; break; }
      if ((inRecovery && strategyEnabled) || (!inRecovery && strategyM1Enabled)) patternTradeTakenRef.current = true;
      if (!turboMode) await new Promise(r => setTimeout(r, 400));
    }
    setIsRunning(false); runningRef.current = false; setBotStatus('idle'); patternTradeTakenRef.current = false; shouldStopRef.current = false;
  }, [isRunning, stake, m1Enabled, m2Enabled, m1Contract, m2Contract, m1Barrier, m2Barrier, m1Symbol, m2Symbol, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, strategyEnabled, strategyM1Enabled, m1StrategyMode, m2StrategyMode, scannerActive, findScannerMatchForMarket, checkStrategyForMarket, turboMode, m1HookEnabled, m2HookEnabled, m1VirtualLossCount, m2VirtualLossCount, m1RealCount, m2RealCount, ensureConnection, executeRealTrade, localBalance]);
  
  const stopBot = useCallback(() => { shouldStopRef.current = true; runningRef.current = false; setIsRunning(false); setBotStatus('idle'); patternTradeTakenRef.current = false; }, []);
  const clearLog = useCallback(() => { setLogEntries([]); setWins(0); setLosses(0); setTotalStaked(0); setNetProfit(0); setMartingaleStepState(0); setVhFakeWins(0); setVhFakeLosses(0); setVhConsecLosses(0); setVhStatus('idle'); setTicksCaptured(0); patternTradeTakenRef.current = false; shouldStopRef.current = false; }, []);
  
  const statusConfig: Record<BotStatus, { icon: string; label: string; color: string }> = {
    idle: { icon: '⚪', label: 'IDLE', color: 'text-gray-400' }, trading_m1: { icon: '🟢', label: 'TRADING M1', color: 'text-emerald-400' },
    recovery: { icon: '🟣', label: 'RECOVERY MODE', color: 'text-purple-400' }, waiting_pattern: { icon: '🟡', label: 'WAITING PATTERN', color: 'text-yellow-400' },
    pattern_matched: { icon: '✅', label: 'PATTERN MATCHED', color: 'text-emerald-400' }, virtual_hook: { icon: '🎣', label: 'VIRTUAL HOOK', color: 'text-blue-400' },
    reconnecting: { icon: '🔄', label: 'RECONNECTING...', color: 'text-orange-400' },
  };
  const status = statusConfig[botStatus];
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
  const cleanM1Pattern = m1Pattern.toUpperCase().replace(/[^EO]/g, '');
  const m1PatternValid = cleanM1Pattern.length >= 2;
  const cleanM2Pattern = m2Pattern.toUpperCase().replace(/[^EO]/g, '');
  const m2PatternValid = cleanM2Pattern.length >= 2;
  const activeSymbol = currentMarket === 1 ? m1Symbol : m2Symbol;
  const activeDigits = (tickMapRef.current.get(activeSymbol) || []).slice(-8);

  const currentConfig = useMemo<BotConfig>(() => ({
    version: 1, botName, m1: { enabled: m1Enabled, symbol: m1Symbol, contract: m1Contract, barrier: m1Barrier, hookEnabled: m1HookEnabled, virtualLossCount: m1VirtualLossCount, realCount: m1RealCount },
    m2: { enabled: m2Enabled, symbol: m2Symbol, contract: m2Contract, barrier: m2Barrier, hookEnabled: m2HookEnabled, virtualLossCount: m2VirtualLossCount, realCount: m2RealCount },
    risk: { stake, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss },
    strategy: { m1Enabled: strategyM1Enabled, m2Enabled: strategyEnabled, m1Mode: m1StrategyMode, m2Mode: m2StrategyMode, m1Pattern, m1DigitCondition, m1DigitCompare, m1DigitWindow, m2Pattern, m2DigitCondition, m2DigitCompare, m2DigitWindow },
    scanner: { active: scannerActive }, turbo: { enabled: turboMode },
  }), [m1Enabled, m1Symbol, m1Contract, m1Barrier, m1HookEnabled, m1VirtualLossCount, m1RealCount, m2Enabled, m2Symbol, m2Contract, m2Barrier, m2HookEnabled, m2VirtualLossCount, m2RealCount, stake, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, strategyM1Enabled, strategyEnabled, m1StrategyMode, m2StrategyMode, m1Pattern, m1DigitCondition, m1DigitCompare, m1DigitWindow, m2Pattern, m2DigitCondition, m2DigitCompare, m2DigitWindow, scannerActive, turboMode, botName]);

  const handleLoadConfig = useCallback((cfg: BotConfig) => {
    if (cfg.m1) { if (cfg.m1.enabled !== undefined) setM1Enabled(cfg.m1.enabled); if (cfg.m1.symbol) setM1Symbol(cfg.m1.symbol); if (cfg.m1.contract) setM1Contract(cfg.m1.contract); if (cfg.m1.barrier) setM1Barrier(cfg.m1.barrier); if (cfg.m1.hookEnabled !== undefined) setM1HookEnabled(cfg.m1.hookEnabled); if (cfg.m1.virtualLossCount) setM1VirtualLossCount(cfg.m1.virtualLossCount); if (cfg.m1.realCount) setM1RealCount(cfg.m1.realCount); }
    if (cfg.m2) { if (cfg.m2.enabled !== undefined) setM2Enabled(cfg.m2.enabled); if (cfg.m2.symbol) setM2Symbol(cfg.m2.symbol); if (cfg.m2.contract) setM2Contract(cfg.m2.contract); if (cfg.m2.barrier) setM2Barrier(cfg.m2.barrier); if (cfg.m2.hookEnabled !== undefined) setM2HookEnabled(cfg.m2.hookEnabled); if (cfg.m2.virtualLossCount) setM2VirtualLossCount(cfg.m2.virtualLossCount); if (cfg.m2.realCount) setM2RealCount(cfg.m2.realCount); }
    if (cfg.risk) { if (cfg.risk.stake) setStake(cfg.risk.stake); if (cfg.risk.martingaleOn !== undefined) setMartingaleOn(cfg.risk.martingaleOn); if (cfg.risk.martingaleMultiplier) setMartingaleMultiplier(cfg.risk.martingaleMultiplier); if (cfg.risk.martingaleMaxSteps) setMartingaleMaxSteps(cfg.risk.martingaleMaxSteps); if (cfg.risk.takeProfit) setTakeProfit(cfg.risk.takeProfit); if (cfg.risk.stopLoss) setStopLoss(cfg.risk.stopLoss); }
    if (cfg.strategy) { if (cfg.strategy.m1Enabled !== undefined) setStrategyM1Enabled(cfg.strategy.m1Enabled); if (cfg.strategy.m2Enabled !== undefined) setStrategyEnabled(cfg.strategy.m2Enabled); if (cfg.strategy.m1Mode) setM1StrategyMode(cfg.strategy.m1Mode); if (cfg.strategy.m2Mode) setM2StrategyMode(cfg.strategy.m2Mode); if (cfg.strategy.m1Pattern !== undefined) setM1Pattern(cfg.strategy.m1Pattern); if (cfg.strategy.m1DigitCondition) setM1DigitCondition(cfg.strategy.m1DigitCondition); if (cfg.strategy.m1DigitCompare) setM1DigitCompare(cfg.strategy.m1DigitCompare); if (cfg.strategy.m1DigitWindow) setM1DigitWindow(cfg.strategy.m1DigitWindow); if (cfg.strategy.m2Pattern !== undefined) setM2Pattern(cfg.strategy.m2Pattern); if (cfg.strategy.m2DigitCondition) setM2DigitCondition(cfg.strategy.m2DigitCondition); if (cfg.strategy.m2DigitCompare) setM2DigitCompare(cfg.strategy.m2DigitCompare); if (cfg.strategy.m2DigitWindow) setM2DigitWindow(cfg.strategy.m2DigitWindow); }
    if (cfg.scanner?.active !== undefined) setScannerActive(cfg.scanner.active); if (cfg.turbo?.enabled !== undefined) setTurboMode(cfg.turbo.enabled); if (cfg.botName) setBotName(cfg.botName);
  }, []);

  useEffect(() => {
    const state = location.state as { loadConfig?: BotConfig } | null;
    if (state?.loadConfig) { handleLoadConfig(state.loadConfig); window.history.replaceState({}, ''); }
  }, [location.state, handleLoadConfig]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSocialPopup(true), 30000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <TPSLNotificationPopup />
      {showSocialPopup && <SocialNotificationPopup onClose={() => setShowSocialPopup(false)} />}
      
      <div className="pro-scanner-bot">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div className="logo">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h1>Milliefx Pro Scanner Bot</h1>
              <p>Advanced Market Scanning & Recovery System</p>
            </div>
          </div>
          <div className="header-right">
            <Badge className={`status-badge ${status.color}`}>{status.icon} {status.label}</Badge>
            {isRunning && <Badge variant="outline" className="pnl-badge">P/L: ${netProfit.toFixed(2)}</Badge>}
            {!isConnected && <Badge variant="destructive" className="disconnect-badge">🔌 DISCONNECTED</Badge>}
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="stats-grid">
          <div className="stat-card scanner-card">
            <div className="stat-header">
              <div className="stat-title"><Eye className="w-4 h-4"/><span>Scan All Markets</span><Badge variant={scannerActive ? 'default' : 'secondary'}>{scannerActive ? '🟢 ON' : '⚫ OFF'}</Badge></div>
              <Switch checked={scannerActive} onCheckedChange={setScannerActive} disabled={isRunning} />
            </div>
            <div className="markets-list">{SCANNER_MARKETS.map(m => <Badge key={m.symbol} variant="outline" className={`market-badge ${tickCounts[m.symbol] ? 'active' : ''}`}>{m.name}</Badge>)}</div>
          </div>
          <div className="stat-card turbo-card">
            <div className="stat-header">
              <div className="stat-title"><Zap className={`w-4 h-4 ${turboMode ? 'active' : ''}`}/><span>Turbo Mode</span></div>
              <Button size="sm" variant={turboMode ? 'default' : 'outline'} className="turbo-btn" onClick={() => setTurboMode(!turboMode)} disabled={isRunning}>{turboMode ? '⚡ ON' : 'OFF'}</Button>
            </div>
            <div className="turbo-stats">
              <div><div>Latency</div><div className="value">{turboLatency}ms</div></div>
              <div><div>Captured</div><div className="value">{ticksCaptured}</div></div>
              <div><div>Missed</div><div className="value missed">{ticksMissed}</div></div>
            </div>
          </div>
          <div className="stat-card stats-card">
            <div className="stat-header"><span>Live Stats</span><span className="balance">${localBalance.toFixed(2)}</span></div>
            <div className="live-stats">
              <div><div>W/L</div><div><span className="wins">{wins}</span>/<span className="losses">{losses}</span></div></div>
              <div><div>P/L</div><div className={netProfit >= 0 ? 'profit' : 'loss'}>${netProfit.toFixed(2)}</div></div>
              <div><div>Stake</div><div>${currentStake.toFixed(2)}{martingaleStep > 0 && <span className="martingale-step">M{martingaleStep}</span>}</div></div>
            </div>
          </div>
        </div>
        
        {/* Main Layout */}
        <div className="main-grid">
          {/* Left Column */}
          <div className="left-column">
            {/* M1 Card */}
            <div className="config-card m1-card">
              <div className="card-header"><h3><Home className="w-4 h-4"/> M1 — Home</h3><Switch checked={m1Enabled} onCheckedChange={setM1Enabled} disabled={isRunning} /></div>
              <div className="card-content">
                <Select value={m1Symbol} onValueChange={setM1Symbol} disabled={isRunning}>
                  <SelectTrigger className="select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>{SCANNER_MARKETS.map(m => <SelectItem key={m.symbol} value={m.symbol}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={m1Contract} onValueChange={setM1Contract} disabled={isRunning}>
                  <SelectTrigger className="select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRACT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                {needsBarrier(m1Contract) && <Input type="number" min="0" max="9" value={m1Barrier} onChange={e => setM1Barrier(e.target.value)} className="input-field" disabled={isRunning} />}
                <div className="hook-section">
                  <div className="hook-header"><span><Anchor className="w-3 h-3"/> Virtual Hook</span><Switch checked={m1HookEnabled} onCheckedChange={setM1HookEnabled} disabled={isRunning} /></div>
                  {m1HookEnabled && <div className="hook-inputs"><div><label>V-Losses</label><Input type="number" min="1" max="20" value={m1VirtualLossCount} onChange={e => setM1VirtualLossCount(e.target.value)} disabled={isRunning} /></div><div><label>Real Trades</label><Input type="number" min="1" max="10" value={m1RealCount} onChange={e => setM1RealCount(e.target.value)} disabled={isRunning} /></div></div>}
                </div>
              </div>
            </div>
            
            {/* M2 Card */}
            <div className="config-card m2-card">
              <div className="card-header"><h3><RefreshCw className="w-4 h-4"/> M2 — Recovery</h3><Switch checked={m2Enabled} onCheckedChange={setM2Enabled} disabled={isRunning} /></div>
              <div className="card-content">
                <Select value={m2Symbol} onValueChange={setM2Symbol} disabled={isRunning}>
                  <SelectTrigger className="select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>{SCANNER_MARKETS.map(m => <SelectItem key={m.symbol} value={m.symbol}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={m2Contract} onValueChange={setM2Contract} disabled={isRunning}>
                  <SelectTrigger className="select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRACT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                {needsBarrier(m2Contract) && <Input type="number" min="0" max="9" value={m2Barrier} onChange={e => setM2Barrier(e.target.value)} className="input-field" disabled={isRunning} />}
                <div className="hook-section">
                  <div className="hook-header"><span><Anchor className="w-3 h-3"/> Virtual Hook</span><Switch checked={m2HookEnabled} onCheckedChange={setM2HookEnabled} disabled={isRunning} /></div>
                  {m2HookEnabled && <div className="hook-inputs"><div><label>V-Losses</label><Input type="number" min="1" max="20" value={m2VirtualLossCount} onChange={e => setM2VirtualLossCount(e.target.value)} disabled={isRunning} /></div><div><label>Real Trades</label><Input type="number" min="1" max="10" value={m2RealCount} onChange={e => setM2RealCount(e.target.value)} disabled={isRunning} /></div></div>}
                </div>
              </div>
            </div>
            
            {/* Hook Stats */}
            {(m1HookEnabled || m2HookEnabled) && (
              <div className="hook-stats">
                <h3><Anchor className="w-3 h-3"/> Hook Status</h3>
                <div className="stats-row">
                  <div><div>V-Win</div><div className="win">{vhFakeWins}</div></div>
                  <div><div>V-Loss</div><div className="loss">{vhFakeLosses}</div></div>
                  <div><div>Streak</div><div className="streak">{vhConsecLosses}</div></div>
                  <div><div>State</div><div className={`state ${vhStatus}`}>{vhStatus === 'confirmed' ? '✓' : vhStatus === 'waiting' ? '⏳' : '—'}</div></div>
                </div>
              </div>
            )}
            
            {/* Risk Management */}
            <div className="config-card risk-card">
              <h3><Shield className="w-4 h-4"/> Risk Management</h3>
              <div className="risk-inputs">
                <div><label>Stake ($)</label><Input type="number" min="0.35" step="0.01" value={stake} onChange={e => setStake(e.target.value)} disabled={isRunning} /></div>
                <div><label>Take Profit</label><Input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={isRunning} /></div>
                <div><label>Stop Loss</label><Input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={isRunning} /></div>
              </div>
              <div className="martingale-toggle"><label>Martingale</label><Switch checked={martingaleOn} onCheckedChange={setMartingaleOn} disabled={isRunning} /></div>
              {martingaleOn && <div className="martingale-inputs"><div><label>Multiplier</label><Input type="number" min="1.1" step="0.1" value={martingaleMultiplier} onChange={e => setMartingaleMultiplier(e.target.value)} disabled={isRunning} /></div><div><label>Max Steps</label><Input type="number" min="1" max="10" value={martingaleMaxSteps} onChange={e => setMartingaleMaxSteps(e.target.value)} disabled={isRunning} /></div></div>}
              <div className="strategy-checkboxes">
                <label><input type="checkbox" checked={strategyM1Enabled} onChange={e => setStrategyM1Enabled(e.target.checked)} disabled={isRunning} /> Strategy M1</label>
                <label><input type="checkbox" checked={strategyEnabled} onChange={e => setStrategyEnabled(e.target.checked)} disabled={isRunning} /> Strategy M2</label>
              </div>
            </div>
            
            {/* Strategy Conditions */}
            {(strategyEnabled || strategyM1Enabled) && (
              <div className="config-card strategy-card">
                <h3><Zap className="w-4 h-4"/> Strategy Conditions</h3>
                {strategyM1Enabled && (
                  <div className="strategy-section m1-strategy">
                    <div className="strategy-header"><label>M1 Strategy</label><div className="mode-buttons"><Button size="sm" variant={m1StrategyMode === 'pattern' ? 'default' : 'outline'} onClick={() => setM1StrategyMode('pattern')} disabled={isRunning}>Pattern</Button><Button size="sm" variant={m1StrategyMode === 'digit' ? 'default' : 'outline'} onClick={() => setM1StrategyMode('digit')} disabled={isRunning}>Digit</Button></div></div>
                    {m1StrategyMode === 'pattern' ? (
                      <>
                        <Textarea placeholder="E=Even O=Odd e.g. EEEOE" value={m1Pattern} onChange={e => setM1Pattern(e.target.value.toUpperCase().replace(/[^EO]/g, ''))} disabled={isRunning} className="pattern-input" />
                        <div className={`pattern-valid ${m1PatternValid ? 'valid' : 'invalid'}`}>{cleanM1Pattern.length === 0 ? 'Enter pattern...' : m1PatternValid ? `✓ ${cleanM1Pattern}` : `✗ Need 2+`}</div>
                      </>
                    ) : (
                      <div className="digit-inputs"><Input type="number" min="1" max="50" value={m1DigitWindow} onChange={e => setM1DigitWindow(e.target.value)} disabled={isRunning} placeholder="Window" /><Select value={m1DigitCondition} onValueChange={setM1DigitCondition} disabled={isRunning}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['==', '>', '<', '>=', '<='].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Input type="number" min="0" max="9" value={m1DigitCompare} onChange={e => setM1DigitCompare(e.target.value)} disabled={isRunning} placeholder="Digit" /></div>
                    )}
                  </div>
                )}
                {strategyEnabled && (
                  <div className="strategy-section m2-strategy">
                    <div className="strategy-header"><label>M2 Strategy</label><div className="mode-buttons"><Button size="sm" variant={m2StrategyMode === 'pattern' ? 'default' : 'outline'} onClick={() => setM2StrategyMode('pattern')} disabled={isRunning}>Pattern</Button><Button size="sm" variant={m2StrategyMode === 'digit' ? 'default' : 'outline'} onClick={() => setM2StrategyMode('digit')} disabled={isRunning}>Digit</Button></div></div>
                    {m2StrategyMode === 'pattern' ? (
                      <>
                        <Textarea placeholder="E=Even O=Odd e.g. OOEEO" value={m2Pattern} onChange={e => setM2Pattern(e.target.value.toUpperCase().replace(/[^EO]/g, ''))} disabled={isRunning} className="pattern-input" />
                        <div className={`pattern-valid ${m2PatternValid ? 'valid' : 'invalid'}`}>{cleanM2Pattern.length === 0 ? 'Enter pattern...' : m2PatternValid ? `✓ ${cleanM2Pattern}` : `✗ Need 2+`}</div>
                      </>
                    ) : (
                      <div className="digit-inputs"><Input type="number" min="1" max="50" value={m2DigitWindow} onChange={e => setM2DigitWindow(e.target.value)} disabled={isRunning} placeholder="Window" /><Select value={m2DigitCondition} onValueChange={setM2DigitCondition} disabled={isRunning}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['==', '>', '<', '>=', '<='].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Input type="number" min="0" max="9" value={m2DigitCompare} onChange={e => setM2DigitCompare(e.target.value)} disabled={isRunning} placeholder="Digit" /></div>
                    )}
                  </div>
                )}
                {botStatus === 'waiting_pattern' && <div className="pattern-waiting">⏳ WAITING FOR PATTERN...</div>}
                {botStatus === 'pattern_matched' && <div className="pattern-matched">✅ PATTERN MATCHED! Taking trade...</div>}
              </div>
            )}
            
            {/* Bot Config */}
            <div className="config-card config-card-buttons">
              <h3>💾 Bot Config</h3>
              <Input placeholder="Enter bot name..." value={botName} onChange={e => setBotName(e.target.value)} disabled={isRunning} className="bot-name-input" />
              <div className="config-buttons">
                <Button size="sm" variant="outline" disabled={isRunning || !botName.trim()} onClick={() => { const safeName = botName.trim().replace(/[^a-zA-Z0-9_-]/g, '_'); const config = currentConfig; const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-'); const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${safeName}_${ts}.json`; a.click(); URL.revokeObjectURL(url); }}><Download className="w-3 h-3"/> Save</Button>
                <Button size="sm" variant="outline" disabled={isRunning} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.onchange = (ev: any) => { const file = ev.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const cfg = JSON.parse(e.target?.result as string); if (cfg.m1 && cfg.m2 && cfg.risk) handleLoadConfig(cfg); } catch {} }; reader.readAsText(file); }; input.click(); }}><Upload className="w-3 h-3"/> Load</Button>
              </div>
            </div>
          </div>
          
          {/* Right Column */}
          <div className="right-column">
            {/* Live Digits */}
            <div className="digits-card">
              <div className="digits-header"><h3>Live Digits — {activeSymbol}</h3><span className="winrate">Win Rate: {winRate}% | Staked: ${totalStaked.toFixed(2)}</span></div>
              <div className="digits-container">{activeDigits.length === 0 ? <span className="waiting-text">Waiting for ticks...</span> : activeDigits.map((d, i) => { const isOver = d >= 5; const isEven = d % 2 === 0; const isLast = i === activeDigits.length - 1; return <div key={i} className={`digit ${isLast ? 'last' : ''} ${isOver ? 'over' : 'under'}`}><span>{d}</span><span className="digit-type">{isOver ? 'O' : 'U'}{isEven ? 'E' : 'O'}</span></div>; })}</div>
            </div>
            
            {/* Start/Stop Button */}
            <button onClick={isRunning ? stopBot : startBot} disabled={(!isRunning && (!isConnected || localBalance < parseFloat(stake)))} className={`start-stop-btn ${isRunning ? 'stop' : 'start'}`}>
              {isRunning ? <><StopCircle className="w-5 h-5 animate-pulse"/> STOP BOT</> : <><Play className="w-5 h-5"/> START BOT</>}
            </button>
            
            {/* Live Status Panel */}
            <div className="status-panel">
              <div className="status-header"><h3><Zap className="w-4 h-4"/> Live Status (Realtime)</h3>{isRunning && <span className="active-indicator"><span className="pulse"></span> ACTIVE</span>}</div>
              <div className="status-grid">
                <div><div>Status</div><div className={`status-value ${status.color}`}>{status.icon} {status.label}</div></div>
                <div><div>Market</div><div className={`market-value ${currentMarket === 1 ? 'm1' : 'm2'}`}>{currentMarket === 1 ? 'M1 (HOME)' : 'M2 (RECOVERY)'}</div></div>
                <div><div>Win Rate</div><div className="winrate-value">{winRate}%</div></div>
                <div><div>Current P/L</div><div className={`pl-value ${netProfit >= 0 ? 'profit' : 'loss'}`}>${netProfit.toFixed(2)}</div></div>
                <div><div>Current Stake</div><div className="stake-value">${currentStake.toFixed(2)}{martingaleStep > 0 && <span className="martingale-step">M{martingaleStep}</span>}</div></div>
                <div><div>Balance</div><div className="balance-value">${localBalance.toFixed(2)}</div></div>
                <div><div>Total Staked</div><div className="total-staked">${totalStaked.toFixed(2)}</div></div>
                <div><div>W/L (Session)</div><div className="wl-value"><span className="wins">{wins}</span>/<span className="losses">{losses}</span></div></div>
              </div>
              {botStatus === 'virtual_hook' && <div className="hook-status"><Anchor className="w-3 h-3"/> Virtual Hook Active — Waiting for {m1HookEnabled ? m1VirtualLossCount : m2VirtualLossCount} consecutive losses... <span className="count">({vhConsecLosses}/{m1HookEnabled ? m1VirtualLossCount : m2VirtualLossCount})</span></div>}
              {botStatus === 'waiting_pattern' && <div className="scanning-status"><Scan className="w-3 h-3"/> Scanning for pattern match...</div>}
            </div>
            
            {/* Activity Log */}
            <div className="log-card">
              <div className="log-header"><h3><RefreshCw className="w-4 h-4"/> Activity Log <Badge variant="outline" className="log-count">{logEntries.length} entries</Badge></h3><div className="log-actions">{logEntries.length > 0 && logEntries[0].switchInfo && <span className="switch-info">📊 {logEntries[0].switchInfo}</span>}<Button variant="ghost" size="sm" onClick={clearLog} className="clear-log"><Trash2 className="w-4 h-4"/></Button></div></div>
              <div className="log-table-wrapper">
                <table className="log-table">
                  <thead>
                    <tr><th>Time</th><th>Mkt</th><th>Symbol</th><th>Type</th><th>Stake</th><th>Digit</th><th>Result</th><th>P/L</th><th>Bal</th></tr>
                  </thead>
                  <tbody>
                    {logEntries.length === 0 ? (
                      <tr><td colSpan={9} className="empty-log"><div><Zap className="w-8 h-8"/><span>No trades yet — configure and start the bot</span></div></td></tr>
                    ) : logEntries.map(e => (
                      <tr key={e.id} className={`log-row ${e.market === 'M1' ? 'm1-row' : e.market === 'VH' ? 'vh-row' : 'm2-row'}`}>
                        <td className="time">{e.time}</td>
                        <td className={`market ${e.market === 'M1' ? 'm1' : e.market === 'VH' ? 'vh' : 'm2'}`}>{e.market}</td>
                        <td className="symbol">{e.symbol}</td>
                        <td className="contract">{e.contract.replace('DIGIT', '')}</td>
                        <td className="stake">{e.market === 'VH' ? <span className="fake">FAKE</span> : <span>${e.stake.toFixed(2)}</span>}{e.martingaleStep > 0 && e.market !== 'VH' && <span className="martingale-step">M{e.martingaleStep}</span>}</td>
                        <td className="digit">{e.exitDigit}</td>
                        <td className="result"><span className={`result-badge ${e.result === 'Win' || e.result === 'V-Win' ? 'win' : e.result === 'Loss' || e.result === 'V-Loss' ? 'loss' : 'pending'}`}>{e.result === 'Pending' ? '...' : e.result === 'V-Win' ? '✓' : e.result === 'V-Loss' ? '✗' : e.result}</span></td>
                        <td className={`pnl ${e.pnl > 0 ? 'profit' : e.pnl < 0 ? 'loss' : ''}`}>{e.result === 'Pending' ? '...' : e.market === 'VH' ? '-' : `${e.pnl > 0 ? '+' : ''}${e.pnl.toFixed(2)}`}</td>
                        <td className="balance">{e.market === 'VH' ? '-' : `$${e.balance.toFixed(2)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const TradeUiClone = observer(() => <ProScannerBot />);
export default TradeUiClone;
