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

interface DetectedPattern {
  symbol: string;
  name: string;
  patternType: string;
  timestamp: number;
  digits: number[];
  contractType?: string;
  result?: 'Win' | 'Loss';
  stake?: number;
  pnl?: number;
  last15Ticks?: number[];
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

type M1StrategyType = 
  | 'over0_under9_1' | 'over0_under9_2' | 'over0_under9_3' | 'over0_under9_4'
  | 'over1_under8_2' | 'over1_under8_3' | 'over1_under8_4'
  | 'over2_under7_2' | 'over2_under7_3' | 'over2_under7_4' | 'over2_under7_5'
  | 'over3_under6_4'
  | 'over4_under5_4' | 'over4_under5_5' | 'over4_under5_6' | 'over4_under5_7'
  | 'disabled';

type M2RecoveryType = 
  | 'odd_even_3' | 'odd_even_4' | 'odd_even_5' | 'odd_even_6' | 'odd_even_7' | 'odd_even_8' | 'odd_even_9'
  | 'over4_under5_5' | 'over4_under5_6' | 'over4_under5_7' | 'over4_under5_8' | 'over4_under5_9'
  | 'over3_under6_5' | 'over3_under6_7'
  | 'same_direction_3' | 'same_direction_4' | 'same_direction_5' | 'same_direction_6'
  | 'same_direction_7' | 'same_direction_8' | 'same_direction_9' | 'same_direction_10'
  | 'disabled';

type BotStatus = 'idle' | 'trading_m1' | 'recovery' | 'waiting_pattern' | 'pattern_matched' | 'virtual_hook' | 'reconnecting';

const SCANNER_MARKETS: { symbol: string; name: string; color: string }[] = [
  { symbol: 'R_10', name: 'Vol 10', color: 'from-emerald-500 to-teal-500' },
  { symbol: 'R_25', name: 'Vol 25', color: 'from-cyan-500 to-blue-500' },
  { symbol: 'R_50', name: 'Vol 50', color: 'from-indigo-500 to-purple-500' },
  { symbol: 'R_75', name: 'Vol 75', color: 'from-rose-500 to-pink-500' },
  { symbol: 'R_100', name: 'Vol 100', color: 'from-amber-500 to-orange-500' },
  { symbol: '1HZ10V', name: 'V10 1s', color: 'from-emerald-400 to-green-500' },
  { symbol: '1HZ15V', name: 'V15 1s', color: 'from-sky-400 to-blue-500' },
  { symbol: '1HZ25V', name: 'V25 1s', color: 'from-violet-400 to-purple-500' },
  { symbol: '1HZ30V', name: 'V30 1s', color: 'from-fuchsia-400 to-pink-500' },
  { symbol: '1HZ50V', name: 'V50 1s', color: 'from-orange-400 to-red-500' },
  { symbol: '1HZ75V', name: 'V75 1s', color: 'from-teal-400 to-emerald-500' },
  { symbol: '1HZ90V', name: 'V90 1s', color: 'from-blue-400 to-indigo-500' },
  { symbol: '1HZ100V', name: 'V100 1s', color: 'from-purple-400 to-fuchsia-500' },
  { symbol: 'JD10', name: 'Jump 10', color: 'from-red-400 to-rose-500' },
  { symbol: 'JD25', name: 'Jump 25', color: 'from-yellow-400 to-amber-500' },
  { symbol: 'RDBEAR', name: 'Bear', color: 'from-slate-400 to-gray-500' },
  { symbol: 'RDBULL', name: 'Bull', color: 'from-green-400 to-emerald-500' },
];

const CONTRACT_TYPES = [
  'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER',
] as const;

const needsBarrier = (ct: string) => ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(ct);

// Constants
const MAX_SCAN_ATTEMPTS = 100;
const SCAN_INTERVAL = 100;
const CONNECTION_CHECK_INTERVAL = 5000;
const DATA_STALENESS_THRESHOLD = 10000;
const HEARTBEAT_INTERVAL = 30000;
const BALANCE_SYNC_INTERVAL = 1000;
const IMMEDIATE_BALANCE_SYNC_DELAY = 50;
const MARKET_SCROLL_INTERVAL = 10000;
const PATTERN_DISPLAY_DURATION = 4000;

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

// Independent tick storage for Same Direction strategy
const sameDirectionTickMapRef = new Map<string, number[]>();

const updateSameDirectionTickStorage = (symbol: string, digit: number) => {
  let arr = sameDirectionTickMapRef.get(symbol);
  if (!arr) { arr = []; sameDirectionTickMapRef.set(symbol, arr); }
  arr.push(digit);
  if (arr.length > 15) arr.shift();
};

const getSameDirectionRecentDigits = (symbol: string, count: number): number[] => {
  const digits = sameDirectionTickMapRef.get(symbol) || [];
  return digits.slice(-count);
};

const getLast15Ticks = (symbol: string): number[] => {
  const digits = sameDirectionTickMapRef.get(symbol) || [];
  return digits.slice(-15);
};

const getSameDirectionSignal = (ticks: number[], requiredTicks: number): 'even' | 'odd' | null => {
  if (ticks.length < requiredTicks) return null;
  const lastNTicks = ticks.slice(-requiredTicks);
  const allEven = lastNTicks.every(d => d % 2 === 0);
  const allOdd = lastNTicks.every(d => d % 2 !== 0);
  if (allEven) return 'even';
  if (allOdd) return 'odd';
  return null;
};

const checkSameDirectionPattern = (symbol: string, requiredTicks: number): { matched: boolean; contractType?: string; patternDigits?: string } => {
  const digits = getSameDirectionRecentDigits(symbol, requiredTicks);
  if (digits.length < requiredTicks) return { matched: false };
  const signal = getSameDirectionSignal(digits, requiredTicks);
  if (signal === 'even') return { matched: true, contractType: 'DIGITEVEN', patternDigits: digits.join(',') };
  if (signal === 'odd') return { matched: true, contractType: 'DIGITODD', patternDigits: digits.join(',') };
  return { matched: false };
};

const findSameDirectionMatch = (selectedStrategy: M2RecoveryType): { symbol: string; contractType: string; tickLength: number; patternDigits: string; last15Ticks: number[] } | null => {
  const tickLength = parseInt(selectedStrategy.split('_')[2]);
  if (isNaN(tickLength) || tickLength < 3 || tickLength > 10) return null;
  for (const market of SCANNER_MARKETS) {
    const result = checkSameDirectionPattern(market.symbol, tickLength);
    if (result.matched && result.contractType) {
      const last15Ticks = getLast15Ticks(market.symbol);
      console.log(`[Same Direction] ✅ PATTERN FOUND on ${market.symbol} (${tickLength} ticks): ${result.patternDigits} -> ${result.contractType}`);
      return { symbol: market.symbol, contractType: result.contractType, tickLength, patternDigits: result.patternDigits || '', last15Ticks };
    }
  }
  return null;
};

const playPatternVoice = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {}
};

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
  
  // Market 1 config
  const [m1Enabled, setM1Enabled] = useState(true);
  const [m1StrategyType, setM1StrategyType] = useState<M1StrategyType>('over1_under8_2');
  const [m1Symbol, setM1Symbol] = useState('R_100');
  const [m1Contract, setM1Contract] = useState('DIGITEVEN');
  const [m1Barrier, setM1Barrier] = useState('5');

  // Market 2 config
  const [m2Enabled, setM2Enabled] = useState(true);
  const [m2RecoveryType, setM2RecoveryType] = useState<M2RecoveryType>('same_direction_4');
  const [m2Symbol, setM2Symbol] = useState('R_50');
  const [m2Contract, setM2Contract] = useState('DIGITODD');
  const [m2Barrier, setM2Barrier] = useState('5');

  // Virtual Hook config
  const [m1HookEnabled, setM1HookEnabled] = useState(false);
  const [m1VirtualLossCount, setM1VirtualLossCount] = useState('3');
  const [m1RealCount, setM1RealCount] = useState('2');
  const [m2HookEnabled, setM2HookEnabled] = useState(false);
  const [m2VirtualLossCount, setM2VirtualLossCount] = useState('3');
  const [m2RealCount, setM2RealCount] = useState('2');

  // Risk config
  const [stake, setStake] = useState('0.6');
  const [martingaleOn, setMartingaleOn] = useState(true);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState('2.0');
  const [martingaleMaxSteps, setMartingaleMaxSteps] = useState('5');
  const [takeProfit, setTakeProfit] = useState('5');
  const [stopLoss, setStopLoss] = useState('30');

  // Strategy flags
  const [strategyM1Enabled, setStrategyM1Enabled] = useState(true);
  const [strategyM2Enabled, setStrategyM2Enabled] = useState(true);

  // Strategy conditions
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

  // Scanner
  const [scannerActive, setScannerActive] = useState(true);
  const [scannerMarkers, setScannerMarkers] = useState<typeof SCANNER_MARKETS>([]);
  const scannerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Detected Patterns
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([]);
  const [activePattern, setActivePattern] = useState<DetectedPattern | null>(null);
  const [tradeResult, setTradeResult] = useState<{ result: 'Win' | 'Loss'; pnl: number } | null>(null);
  const [isScannerVoiceActive, setIsScannerVoiceActive] = useState(false);

  // Bot state
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
  
  // Balance
  const [localBalance, setLocalBalance] = useState(10000);
  const [accountCurrency, setAccountCurrency] = useState('USD');
  const [lastDigit, setLastDigit] = useState<number | null>(null);
  const [digits, setDigits] = useState<number[]>([]);
  
  // Connection
  const [isConnected, setIsConnected] = useState(false);
  const connectionRetryCountRef = useRef(0);
  const MAX_CONNECTION_RETRIES = 3;
  const shouldStopRef = useRef(false);
  const patternTradeTakenRef = useRef(false);
  const [showSocialPopup, setShowSocialPopup] = useState(false);
  
  // Tick data
  const tickMapRef = useRef<Map<string, number[]>>(new Map());
  const lastTradeTimeRef = useRef<Map<string, number>>(new Map());
  const lastPatternDigitsRef = useRef<Map<string, string>>(new Map());
  const lastTradeOverallRef = useRef<number>(0);
  const lastTickTimeRef = useRef<Map<string, number>>(new Map());
  const subscriptionStatusRef = useRef<Map<string, boolean>>(new Map());
  const isReconnectingRef = useRef(false);
  
  // Turbo mode
  const [turboMode, setTurboMode] = useState(false);
  const [turboLatency, setTurboLatency] = useState(0);
  const [ticksCaptured, setTicksCaptured] = useState(0);
  const [ticksMissed, setTicksMissed] = useState(0);
  const turboBuffersRef = useRef<Map<string, CircularTickBuffer>>(new Map());
  
  // Virtual hook state
  const [vhFakeWins, setVhFakeWins] = useState(0);
  const [vhFakeLosses, setVhFakeLosses] = useState(0);
  const [vhConsecLosses, setVhConsecLosses] = useState(0);
  const [vhStatus, setVhStatus] = useState<'idle' | 'waiting' | 'confirmed' | 'failed'>('idle');
  
  // Bot config
  const [botName, setBotName] = useState('');

  // Clear active pattern after display duration
  useEffect(() => {
    if (activePattern) {
      const timer = setTimeout(() => setActivePattern(null), PATTERN_DISPLAY_DURATION);
      return () => clearTimeout(timer);
    }
  }, [activePattern]);

  useEffect(() => {
    if (tradeResult) {
      const timer = setTimeout(() => setTradeResult(null), PATTERN_DISPLAY_DURATION);
      return () => clearTimeout(timer);
    }
  }, [tradeResult]);

  // Start scanner animation
  useEffect(() => {
    if (isRunning) {
      setIsScannerVoiceActive(true);
      const shuffled = [...SCANNER_MARKETS];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setScannerMarkers(shuffled);
      scannerIntervalRef.current = setInterval(() => {
        setScannerMarkers(prev => {
          if (prev.length === 0) return [...SCANNER_MARKETS];
          const newMarkers = [...prev];
          const first = newMarkers.shift();
          if (first) newMarkers.push(first);
          return newMarkers;
        });
      }, MARKET_SCROLL_INTERVAL);
    } else {
      setIsScannerVoiceActive(false);
      if (scannerIntervalRef.current) { clearInterval(scannerIntervalRef.current); scannerIntervalRef.current = null; }
      setScannerMarkers([]);
    }
    return () => { if (scannerIntervalRef.current) clearInterval(scannerIntervalRef.current); };
  }, [isRunning]);

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
        await setupTickSubscription('R_100');
        await setupAllMarketSubscriptions();
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
    } catch (err) { console.error('Tick subscription error:', err); }
  };

  const setupAllMarketSubscriptions = async () => {
    if (!apiRef.current) return;
    for (const market of SCANNER_MARKETS) {
      try {
        await apiRef.current.send({ ticks: market.symbol, subscribe: 1 });
        subscriptionStatusRef.current.set(market.symbol, true);
      } catch (err) { console.error(`Failed to subscribe to ${market.symbol}:`, err); }
    }
  };

  // Global tick handler
  useEffect(() => {
    const handler = (data: any) => {
      if (data?.msg_type === 'tick' && data?.tick) {
        const sym = data.tick.symbol;
        const quote = data.tick.quote;
        const digit = getLastDigit(quote);
        
        if (typeof digit === 'number' && !isNaN(digit) && digit >= 0 && digit <= 9) {
          lastTickTimeRef.current.set(sym, Date.now());
          
          // Update tick map
          const map = tickMapRef.current;
          let arr = map.get(sym);
          if (!arr) { arr = []; map.set(sym, arr); }
          arr.push(digit);
          if (arr.length > 200) arr.shift();
          
          // Update same direction storage
          updateSameDirectionTickStorage(sym, digit);
          
          // Update active symbol display
          if (sym === (currentMarket === 1 ? m1Symbol : m2Symbol)) {
            setLastDigit(digit);
            setDigits(prev => [...prev.slice(-8), digit]);
            setTicksCaptured(prev => prev + 1);
          }
        }
      }
    };
    
    apiRef.current?.connection?.addEventListener('message', handler);
    return () => apiRef.current?.connection?.removeEventListener('message', handler);
  }, [currentMarket, m1Symbol, m2Symbol]);

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

  // M1 Pattern Checker
  const getRecentDigits = useCallback((symbol: string, count: number): number[] => {
    const digits = tickMapRef.current.get(symbol) || [];
    return digits.slice(-count);
  }, []);

  const isDataFresh = useCallback((symbol: string): boolean => {
    const lastTickTime = lastTickTimeRef.current.get(symbol);
    if (!lastTickTime) return false;
    return Date.now() - lastTickTime < DATA_STALENESS_THRESHOLD;
  }, []);

  const checkM1Pattern = useCallback((symbol: string): { matched: boolean; contractType?: string; barrier?: string; patternDigits?: string } => {
    if (!isDataFresh(symbol)) return { matched: false };
    const digits = getRecentDigits(symbol, 10);
    if (digits.length === 0) return { matched: false };
    
    switch (m1StrategyType) {
      case 'over0_under9_1': {
        const last1 = digits.slice(-1);
        if (last1[0] === 0) return { matched: true, contractType: 'DIGITOVER', barrier: '0', patternDigits: `${last1[0]}` };
        if (last1[0] === 9) return { matched: true, contractType: 'DIGITUNDER', barrier: '9', patternDigits: `${last1[0]}` };
        return { matched: false };
      }
      case 'over0_under9_2': {
        if (digits.length < 2) return { matched: false };
        const last2 = digits.slice(-2);
        if (last2[0] === 0 && last2[1] === 0) return { matched: true, contractType: 'DIGITOVER', barrier: '0', patternDigits: last2.join(',') };
        if (last2[0] === 9 && last2[1] === 9) return { matched: true, contractType: 'DIGITUNDER', barrier: '9', patternDigits: last2.join(',') };
        return { matched: false };
      }
      case 'over0_under9_3': {
        if (digits.length < 3) return { matched: false };
        const last3 = digits.slice(-3);
        if (last3.every(d => d === 0)) return { matched: true, contractType: 'DIGITOVER', barrier: '0', patternDigits: last3.join(',') };
        if (last3.every(d => d === 9)) return { matched: true, contractType: 'DIGITUNDER', barrier: '9', patternDigits: last3.join(',') };
        return { matched: false };
      }
      case 'over0_under9_4': {
        if (digits.length < 4) return { matched: false };
        const last4 = digits.slice(-4);
        if (last4.every(d => d === 0)) return { matched: true, contractType: 'DIGITOVER', barrier: '0', patternDigits: last4.join(',') };
        if (last4.every(d => d === 9)) return { matched: true, contractType: 'DIGITUNDER', barrier: '9', patternDigits: last4.join(',') };
        return { matched: false };
      }
      case 'over1_under8_2': {
        if (digits.length < 2) return { matched: false };
        const last2 = digits.slice(-2);
        if (last2[0] === 0 && last2[1] === 0) return { matched: true, contractType: 'DIGITOVER', barrier: '1', patternDigits: last2.join(',') };
        if (last2[0] === 9 && last2[1] === 9) return { matched: true, contractType: 'DIGITUNDER', barrier: '8', patternDigits: last2.join(',') };
        return { matched: false };
      }
      case 'over1_under8_3': {
        if (digits.length < 3) return { matched: false };
        const last3 = digits.slice(-3);
        if (last3.every(d => d === 0)) return { matched: true, contractType: 'DIGITOVER', barrier: '1', patternDigits: last3.join(',') };
        if (last3.every(d => d === 9)) return { matched: true, contractType: 'DIGITUNDER', barrier: '8', patternDigits: last3.join(',') };
        return { matched: false };
      }
      case 'over1_under8_4': {
        if (digits.length < 4) return { matched: false };
        const last4 = digits.slice(-4);
        if (last4.every(d => d === 0)) return { matched: true, contractType: 'DIGITOVER', barrier: '1', patternDigits: last4.join(',') };
        if (last4.every(d => d === 9)) return { matched: true, contractType: 'DIGITUNDER', barrier: '8', patternDigits: last4.join(',') };
        return { matched: false };
      }
      case 'over2_under7_2': {
        if (digits.length < 2) return { matched: false };
        const last2 = digits.slice(-2);
        if (last2.every(d => d < 2)) return { matched: true, contractType: 'DIGITOVER', barrier: '2', patternDigits: last2.join(',') };
        if (last2.every(d => d > 7)) return { matched: true, contractType: 'DIGITUNDER', barrier: '7', patternDigits: last2.join(',') };
        return { matched: false };
      }
      case 'over2_under7_3': {
        if (digits.length < 3) return { matched: false };
        const last3 = digits.slice(-3);
        if (last3.every(d => d < 2)) return { matched: true, contractType: 'DIGITOVER', barrier: '2', patternDigits: last3.join(',') };
        if (last3.every(d => d > 7)) return { matched: true, contractType: 'DIGITUNDER', barrier: '7', patternDigits: last3.join(',') };
        return { matched: false };
      }
      case 'over2_under7_4': {
        if (digits.length < 4) return { matched: false };
        const last4 = digits.slice(-4);
        if (last4.every(d => d < 2)) return { matched: true, contractType: 'DIGITOVER', barrier: '2', patternDigits: last4.join(',') };
        if (last4.every(d => d > 7)) return { matched: true, contractType: 'DIGITUNDER', barrier: '7', patternDigits: last4.join(',') };
        return { matched: false };
      }
      case 'over2_under7_5': {
        if (digits.length < 5) return { matched: false };
        const last5 = digits.slice(-5);
        if (last5.every(d => d < 2)) return { matched: true, contractType: 'DIGITOVER', barrier: '2', patternDigits: last5.join(',') };
        if (last5.every(d => d > 7)) return { matched: true, contractType: 'DIGITUNDER', barrier: '7', patternDigits: last5.join(',') };
        return { matched: false };
      }
      case 'over3_under6_4': {
        if (digits.length < 4) return { matched: false };
        const last4 = digits.slice(-4);
        if (last4.every(d => d < 3)) return { matched: true, contractType: 'DIGITOVER', barrier: '3', patternDigits: last4.join(',') };
        if (last4.every(d => d > 6)) return { matched: true, contractType: 'DIGITUNDER', barrier: '6', patternDigits: last4.join(',') };
        return { matched: false };
      }
      case 'over4_under5_4': {
        if (digits.length < 4) return { matched: false };
        const last4 = digits.slice(-4);
        if (last4.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last4.join(',') };
        if (last4.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last4.join(',') };
        return { matched: false };
      }
      case 'over4_under5_5': {
        if (digits.length < 5) return { matched: false };
        const last5 = digits.slice(-5);
        if (last5.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last5.join(',') };
        if (last5.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last5.join(',') };
        return { matched: false };
      }
      case 'over4_under5_6': {
        if (digits.length < 6) return { matched: false };
        const last6 = digits.slice(-6);
        if (last6.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last6.join(',') };
        if (last6.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last6.join(',') };
        return { matched: false };
      }
      case 'over4_under5_7': {
        if (digits.length < 7) return { matched: false };
        const last7 = digits.slice(-7);
        if (last7.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last7.join(',') };
        if (last7.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last7.join(',') };
        return { matched: false };
      }
      default: return { matched: false };
    }
  }, [m1StrategyType, isDataFresh, getRecentDigits]);

  // M2 Pattern Checker
  const checkM2Pattern = useCallback((symbol: string): { matched: boolean; contractType?: string; barrier?: string; patternDigits?: string } => {
    if (!isDataFresh(symbol)) return { matched: false };
    const digits = getRecentDigits(symbol, 10);
    if (digits.length === 0) return { matched: false };
    
    // Same Direction strategies
    if (m2RecoveryType.startsWith('same_direction_')) {
      const tickLength = parseInt(m2RecoveryType.split('_')[2]);
      if (digits.length < tickLength) return { matched: false };
      const lastNDigits = digits.slice(-tickLength);
      const patternKey = lastNDigits.join(',');
      const allEven = lastNDigits.every(d => d % 2 === 0);
      const allOdd = lastNDigits.every(d => d % 2 !== 0);
      if (allEven) return { matched: true, contractType: 'DIGITEVEN', patternDigits: patternKey };
      if (allOdd) return { matched: true, contractType: 'DIGITODD', patternDigits: patternKey };
      return { matched: false };
    }
    
    switch (m2RecoveryType) {
      case 'odd_even_3': {
        if (digits.length < 3) return { matched: false };
        const last3 = digits.slice(-3);
        if (last3.every(d => d % 2 !== 0)) return { matched: true, contractType: 'DIGITODD', patternDigits: last3.join(',') };
        if (last3.every(d => d % 2 === 0)) return { matched: true, contractType: 'DIGITEVEN', patternDigits: last3.join(',') };
        return { matched: false };
      }
      case 'odd_even_4': {
        if (digits.length < 4) return { matched: false };
        const last4 = digits.slice(-4);
        if (last4.every(d => d % 2 !== 0)) return { matched: true, contractType: 'DIGITODD', patternDigits: last4.join(',') };
        if (last4.every(d => d % 2 === 0)) return { matched: true, contractType: 'DIGITEVEN', patternDigits: last4.join(',') };
        return { matched: false };
      }
      case 'odd_even_5': {
        if (digits.length < 5) return { matched: false };
        const last5 = digits.slice(-5);
        if (last5.every(d => d % 2 !== 0)) return { matched: true, contractType: 'DIGITODD', patternDigits: last5.join(',') };
        if (last5.every(d => d % 2 === 0)) return { matched: true, contractType: 'DIGITEVEN', patternDigits: last5.join(',') };
        return { matched: false };
      }
      case 'odd_even_6': {
        if (digits.length < 6) return { matched: false };
        const last6 = digits.slice(-6);
        if (last6.every(d => d % 2 !== 0)) return { matched: true, contractType: 'DIGITODD', patternDigits: last6.join(',') };
        if (last6.every(d => d % 2 === 0)) return { matched: true, contractType: 'DIGITEVEN', patternDigits: last6.join(',') };
        return { matched: false };
      }
      case 'odd_even_7': {
        if (digits.length < 7) return { matched: false };
        const last7 = digits.slice(-7);
        if (last7.every(d => d % 2 !== 0)) return { matched: true, contractType: 'DIGITODD', patternDigits: last7.join(',') };
        if (last7.every(d => d % 2 === 0)) return { matched: true, contractType: 'DIGITEVEN', patternDigits: last7.join(',') };
        return { matched: false };
      }
      case 'odd_even_8': {
        if (digits.length < 8) return { matched: false };
        const last8 = digits.slice(-8);
        if (last8.every(d => d % 2 !== 0)) return { matched: true, contractType: 'DIGITODD', patternDigits: last8.join(',') };
        if (last8.every(d => d % 2 === 0)) return { matched: true, contractType: 'DIGITEVEN', patternDigits: last8.join(',') };
        return { matched: false };
      }
      case 'odd_even_9': {
        if (digits.length < 9) return { matched: false };
        const last9 = digits.slice(-9);
        if (last9.every(d => d % 2 !== 0)) return { matched: true, contractType: 'DIGITODD', patternDigits: last9.join(',') };
        if (last9.every(d => d % 2 === 0)) return { matched: true, contractType: 'DIGITEVEN', patternDigits: last9.join(',') };
        return { matched: false };
      }
      case 'over4_under5_5': {
        if (digits.length < 5) return { matched: false };
        const last5 = digits.slice(-5);
        if (last5.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last5.join(',') };
        if (last5.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last5.join(',') };
        return { matched: false };
      }
      case 'over4_under5_6': {
        if (digits.length < 6) return { matched: false };
        const last6 = digits.slice(-6);
        if (last6.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last6.join(',') };
        if (last6.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last6.join(',') };
        return { matched: false };
      }
      case 'over4_under5_7': {
        if (digits.length < 7) return { matched: false };
        const last7 = digits.slice(-7);
        if (last7.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last7.join(',') };
        if (last7.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last7.join(',') };
        return { matched: false };
      }
      case 'over4_under5_8': {
        if (digits.length < 8) return { matched: false };
        const last8 = digits.slice(-8);
        if (last8.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last8.join(',') };
        if (last8.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last8.join(',') };
        return { matched: false };
      }
      case 'over4_under5_9': {
        if (digits.length < 9) return { matched: false };
        const last9 = digits.slice(-9);
        if (last9.every(d => d >= 5)) return { matched: true, contractType: 'DIGITOVER', barrier: '4', patternDigits: last9.join(',') };
        if (last9.every(d => d <= 4)) return { matched: true, contractType: 'DIGITUNDER', barrier: '5', patternDigits: last9.join(',') };
        return { matched: false };
      }
      case 'over3_under6_5': {
        if (digits.length < 5) return { matched: false };
        const last5 = digits.slice(-5);
        if (last5.every(d => d < 3)) return { matched: true, contractType: 'DIGITOVER', barrier: '3', patternDigits: last5.join(',') };
        if (last5.every(d => d > 6)) return { matched: true, contractType: 'DIGITUNDER', barrier: '6', patternDigits: last5.join(',') };
        return { matched: false };
      }
      case 'over3_under6_7': {
        if (digits.length < 7) return { matched: false };
        const last7 = digits.slice(-7);
        if (last7.every(d => d < 3)) return { matched: true, contractType: 'DIGITOVER', barrier: '3', patternDigits: last7.join(',') };
        if (last7.every(d => d > 6)) return { matched: true, contractType: 'DIGITUNDER', barrier: '6', patternDigits: last7.join(',') };
        return { matched: false };
      }
      default: return { matched: false };
    }
  }, [m2RecoveryType, isDataFresh, getRecentDigits]);

  const addDetectedPattern = useCallback((symbol: string, name: string, patternType: string, digits: number[], contractType?: string, last15Ticks?: number[]) => {
    const newPattern: DetectedPattern = { symbol, name, patternType, timestamp: Date.now(), digits: [...digits], contractType, last15Ticks: last15Ticks || [...digits] };
    setDetectedPatterns(prev => [newPattern, ...prev].slice(0, 10));
    setActivePattern(newPattern);
    if (isScannerVoiceActive) playPatternVoice();
    setTimeout(() => setDetectedPatterns(prev => prev.filter(p => p.timestamp !== newPattern.timestamp)), 5000);
  }, [isScannerVoiceActive]);

  const updatePatternResult = useCallback((symbol: string, result: 'Win' | 'Loss', pnl: number, stakeAmount: number) => {
    setActivePattern(prev => prev && prev.symbol === symbol ? { ...prev, result, pnl, stake: stakeAmount } : prev);
    setTradeResult({ result, pnl });
  }, []);

  // Find M1 match
  const findM1Match = useCallback((): { symbol: string; contractType: string; barrier?: string; patternDigits: string; digitsArray: number[]; last15Ticks: number[] } | null => {
    if (Date.now() - lastTradeOverallRef.current < 2000) return null;
    for (const market of SCANNER_MARKETS) {
      const hasSubscription = subscriptionStatusRef.current.get(market.symbol);
      if (!hasSubscription) continue;
      const result = checkM1Pattern(market.symbol);
      if (result.matched && result.contractType && result.patternDigits) {
        const digits = getRecentDigits(market.symbol, 8);
        const last15Ticks = getLast15Ticks(market.symbol);
        addDetectedPattern(market.symbol, market.name, `M1: ${m1StrategyType}`, digits, result.contractType, last15Ticks);
        const lastPattern = lastPatternDigitsRef.current.get(market.symbol);
        if (lastPattern === result.patternDigits) continue;
        const lastTrade = lastTradeTimeRef.current.get(market.symbol) || 0;
        if (Date.now() - lastTrade < 30000) continue;
        console.log(`[M1] ✅ PATTERN FOUND on ${market.symbol}: ${result.patternDigits}`);
        return { symbol: market.symbol, contractType: result.contractType, barrier: result.barrier, patternDigits: result.patternDigits, digitsArray: digits, last15Ticks };
      }
    }
    return null;
  }, [checkM1Pattern, m1StrategyType, addDetectedPattern, getRecentDigits]);

  // Find M2 match
  const findM2Match = useCallback((): { symbol: string; contractType: string; barrier?: string; patternDigits: string; digitsArray: number[]; last15Ticks: number[] } | null => {
    if (Date.now() - lastTradeOverallRef.current < 2000) return null;
    const isSameDirectionStrategy = m2RecoveryType.startsWith('same_direction_');
    if (isSameDirectionStrategy) {
      const match = findSameDirectionMatch(m2RecoveryType);
      if (match) {
        const market = SCANNER_MARKETS.find(m => m.symbol === match.symbol);
        if (market) {
          const digits = getSameDirectionRecentDigits(match.symbol, match.tickLength);
          addDetectedPattern(match.symbol, market.name, `M2: ${m2RecoveryType} (${match.tickLength} ticks)`, digits, match.contractType, match.last15Ticks);
          const lastPattern = lastPatternDigitsRef.current.get(match.symbol);
          if (lastPattern === match.patternDigits) return null;
          const lastTrade = lastTradeTimeRef.current.get(match.symbol) || 0;
          if (Date.now() - lastTrade < 30000) return null;
          console.log(`[Same Direction M2] ✅ PATTERN FOUND on ${match.symbol}`);
          return { symbol: match.symbol, contractType: match.contractType, patternDigits: match.patternDigits, digitsArray: digits, last15Ticks: match.last15Ticks };
        }
      }
      return null;
    }
    for (const market of SCANNER_MARKETS) {
      const hasSubscription = subscriptionStatusRef.current.get(market.symbol);
      if (!hasSubscription) continue;
      const result = checkM2Pattern(market.symbol);
      if (result.matched && result.contractType && result.patternDigits) {
        const digits = getRecentDigits(market.symbol, 8);
        const last15Ticks = getLast15Ticks(market.symbol);
        addDetectedPattern(market.symbol, market.name, `M2: ${m2RecoveryType}`, digits, result.contractType, last15Ticks);
        const lastPattern = lastPatternDigitsRef.current.get(market.symbol);
        if (lastPattern === result.patternDigits) continue;
        const lastTrade = lastTradeTimeRef.current.get(market.symbol) || 0;
        if (Date.now() - lastTrade < 30000) continue;
        console.log(`[M2] ✅ PATTERN FOUND on ${market.symbol}: ${result.patternDigits}`);
        return { symbol: market.symbol, contractType: result.contractType, barrier: result.barrier, patternDigits: result.patternDigits, digitsArray: digits, last15Ticks };
      }
    }
    return null;
  }, [checkM2Pattern, m2RecoveryType, addDetectedPattern, getRecentDigits]);

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

  const executeRealTrade = useCallback(async (cfg: any, tradeSymbol: string, cStake: number, mStep: number, mkt: 1 | 2, currentBalance: number, currentPnl: number, baseStake: number, patternDigits: string, patternDigitsArray: number[], last15Ticks: number[]) => {
    if (!apiRef.current?.isConnected?.()) { const connected = await ensureConnection(); if (!connected) throw new Error('No connection available'); }
    const logId = ++logIdRef.current;
    const now = new Date().toLocaleTimeString();
    setTotalStaked(prev => prev + cStake);
    setCurrentStakeState(cStake);
    
    // Record pattern and trade time to prevent duplicates
    lastPatternDigitsRef.current.set(tradeSymbol, patternDigits);
    lastTradeTimeRef.current.set(tradeSymbol, Date.now());
    lastTradeOverallRef.current = Date.now();
    
    setLogEntries(prev => [{ id: logId, time: now, market: mkt === 1 ? 'M1' : 'M2', symbol: tradeSymbol, contract: cfg.contract, stake: cStake, martingaleStep: mStep, exitDigit: '...', result: 'Pending', pnl: 0, balance: currentBalance, switchInfo: `Pattern: ${patternDigits} | Last 15: ${last15Ticks.join(',')}`, }, ...prev].slice(0, 100));
    
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
      
      // Update pattern with trade result
      updatePatternResult(tradeSymbol, won ? 'Win' : 'Loss', pnl, cStake);
      
      const exitDigit = String(getLastDigit(result.sellPrice || 0));
      let switchInfo = `Pattern: ${patternDigits} | Exit: ${exitDigit} | Last 15: ${last15Ticks.join(',')}`;
      let newCStake = cStake;
      let newMStep = mStep;
      let newInRecovery = inRecovery;
      
      if (won) {
        setWins(prev => prev + 1);
        if (inRecovery) {
          switchInfo += ' ✓ Recovery WIN → Back to M1';
          newInRecovery = false;
        } else {
          switchInfo += ' ✓ WIN → Continue scanning';
        }
        newMStep = 0;
        newCStake = baseStake;
      } else {
        setLosses(prev => prev + 1);
        if (martingaleOn && mStep < parseInt(martingaleMaxSteps)) {
          newCStake = parseFloat((cStake * (parseFloat(martingaleMultiplier) || 2)).toFixed(2));
          newMStep++;
          if (!inRecovery && m2Enabled) {
            newInRecovery = true;
            switchInfo += ` ✗ Loss → Martingale (Step ${newMStep}) → M2 Recovery`;
          } else if (!inRecovery && !m2Enabled) {
            switchInfo += ` ✗ Loss → Martingale (Step ${newMStep}) → Continue M1`;
          } else if (inRecovery) {
            switchInfo += ` ✗ Loss → Martingale (Step ${newMStep}) → Stay M2`;
          }
        } else {
          switchInfo += martingaleOn ? ` ✗ Loss → Max steps reached. Reset.` : ' ✗ Loss → Martingale disabled. Reset.';
          if (!inRecovery && m2Enabled) {
            newInRecovery = true;
            switchInfo += ' → M2 Recovery';
          }
          newMStep = 0;
          newCStake = baseStake;
        }
      }
      
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
    } catch (err: any) {
      console.error('Trade execution error:', err);
      setLogEntries(prev => prev.map(e => e.id === logId ? { ...e, result: 'Loss', pnl: 0, exitDigit: '-', switchInfo: `Error: ${err.message}` } : e));
      return { localPnl: updatedPnl, localBalance: updatedBalance, cStake, mStep, inRecovery, shouldBreak: false, won: false };
    }
  }, [turboMode, waitForNextTick, purchaseContract, waitForContractResult, updateBalanceImmediately, updatePatternResult, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, m2Enabled, ensureConnection]);

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
    setVhFakeWins(0); setVhFakeLosses(0); setVhConsecLosses(0); setVhStatus('idle');
    setNetProfit(0);
    patternTradeTakenRef.current = false;
    
    let cStake = baseStake;
    let mStep = 0;
    let inRecovery = false;
    let currentPnl = 0;
    let currentBalanceLocal = localBalance;
    
    const getConfig = (market: 1 | 2) => {
      if (market === 1) return { contract: m1Contract, barrier: m1Barrier, symbol: m1Symbol };
      return { contract: m2Contract, barrier: m2Barrier, symbol: m2Symbol };
    };
    
    while (runningRef.current && !shouldStopRef.current) {
      if (currentPnl >= parseFloat(takeProfit) || currentPnl <= -parseFloat(stopLoss)) { shouldStopRef.current = true; break; }
      if (!apiRef.current?.isConnected?.()) { const reconnected = await ensureConnection(); if (!reconnected) break; }
      
      const mkt: 1 | 2 = inRecovery ? 2 : 1;
      setCurrentMarket(mkt);
      if (mkt === 1 && !m1Enabled) { if (m2Enabled) { inRecovery = true; continue; } else break; }
      if (mkt === 2 && !m2Enabled) { inRecovery = false; continue; }
      
      let tradeSymbol: string;
      let patternDigits: string;
      let digitsArray: number[] = [];
      let last15Ticks: number[] = [];
      const cfg = getConfig(mkt);
      
      const hookEnabled = mkt === 1 ? m1HookEnabled : m2HookEnabled;
      const requiredLosses = parseInt(mkt === 1 ? m1VirtualLossCount : m2VirtualLossCount) || 3;
      const realCount = parseInt(mkt === 1 ? m1RealCount : m2RealCount) || 2;
      
      if ((mkt === 2 && strategyM2Enabled) || (mkt === 1 && strategyM1Enabled)) patternTradeTakenRef.current = false;
      
      if (inRecovery && strategyM2Enabled && m2RecoveryType !== 'disabled') {
        setBotStatus('waiting_pattern');
        let matched = false;
        let matchData = null;
        let attempts = 0;
        while (runningRef.current && !matched && attempts < MAX_SCAN_ATTEMPTS && !shouldStopRef.current) {
          matchData = findM2Match();
          if (matchData) matched = true;
          if (!matched) await new Promise(r => setTimeout(r, SCAN_INTERVAL));
          attempts++;
        }
        if (!runningRef.current || !matched || shouldStopRef.current) continue;
        setBotStatus('pattern_matched');
        tradeSymbol = matchData!.symbol;
        patternDigits = matchData!.patternDigits;
        digitsArray = matchData!.digitsArray;
        last15Ticks = matchData!.last15Ticks;
        await new Promise(r => setTimeout(r, 500));
      } else if (!inRecovery && strategyM1Enabled && m1StrategyType !== 'disabled') {
        setBotStatus('waiting_pattern');
        let matched = false;
        let matchData = null;
        let attempts = 0;
        while (runningRef.current && !matched && attempts < MAX_SCAN_ATTEMPTS && !shouldStopRef.current) {
          matchData = findM1Match();
          if (matchData) matched = true;
          if (!matched) await new Promise(r => setTimeout(r, SCAN_INTERVAL));
          attempts++;
        }
        if (!runningRef.current || !matched || shouldStopRef.current) continue;
        setBotStatus('pattern_matched');
        tradeSymbol = matchData!.symbol;
        patternDigits = matchData!.patternDigits;
        digitsArray = matchData!.digitsArray;
        last15Ticks = matchData!.last15Ticks;
        await new Promise(r => setTimeout(r, 500));
      } else {
        setBotStatus(mkt === 1 ? 'trading_m1' : 'recovery');
        tradeSymbol = cfg.symbol;
        patternDigits = 'default';
      }
      
      if (shouldStopRef.current) break;
      if (((inRecovery && strategyM2Enabled) || (!inRecovery && strategyM1Enabled)) && patternTradeTakenRef.current) { patternTradeTakenRef.current = false; continue; }
      
      // Virtual Hook
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
            if (vResult.won) {
              consecLosses = 0; setVhConsecLosses(0); setVhFakeWins(prev => prev + 1);
              setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, exitDigit: String(vResult.digit), result: 'V-Win', switchInfo: `Virtual WIN → Losses reset (0/${requiredLosses})` } : e));
            } else {
              consecLosses++; setVhConsecLosses(consecLosses); setVhFakeLosses(prev => prev + 1);
              setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, exitDigit: String(vResult.digit), result: 'V-Loss', switchInfo: `Virtual LOSS (${consecLosses}/${requiredLosses})` } : e));
            }
          } catch (err) { console.error('Virtual simulation error:', err); break; }
        }
        if (!runningRef.current || shouldStopRef.current) break;
        setVhStatus('confirmed');
        let winOccurred = false;
        for (let ri = 0; ri < realCount && runningRef.current && !winOccurred && !shouldStopRef.current; ri++) {
          const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalanceLocal, currentPnl, baseStake, patternDigits, digitsArray, last15Ticks);
          if (!result || !runningRef.current) break;
          currentPnl = result.localPnl; currentBalanceLocal = result.localBalance; cStake = result.cStake; mStep = result.mStep; inRecovery = result.inRecovery;
          if (result.shouldBreak) { shouldStopRef.current = true; runningRef.current = false; break; }
          if (result.won) { winOccurred = true; break; }
        }
        setVhStatus('idle'); setVhConsecLosses(0);
        if ((inRecovery && strategyM2Enabled) || (!inRecovery && strategyM1Enabled)) patternTradeTakenRef.current = true;
        if (!runningRef.current || shouldStopRef.current) break;
        continue;
      }
      
      // Regular trade
      const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalanceLocal, currentPnl, baseStake, patternDigits, digitsArray, last15Ticks);
      if (!result || !runningRef.current) break;
      currentPnl = result.localPnl; currentBalanceLocal = result.localBalance; cStake = result.cStake; mStep = result.mStep; inRecovery = result.inRecovery;
      if (result.shouldBreak) { shouldStopRef.current = true; break; }
      if ((inRecovery && strategyM2Enabled) || (!inRecovery && strategyM1Enabled)) patternTradeTakenRef.current = true;
      if (!turboMode) await new Promise(r => setTimeout(r, 400));
    }
    
    setIsRunning(false); runningRef.current = false; setBotStatus('idle'); patternTradeTakenRef.current = false; shouldStopRef.current = false;
  }, [isRunning, stake, m1Enabled, m2Enabled, m1Contract, m2Contract, m1Barrier, m2Barrier, m1Symbol, m2Symbol, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, strategyM1Enabled, strategyM2Enabled, m1StrategyType, m2RecoveryType, m1HookEnabled, m2HookEnabled, m1VirtualLossCount, m2VirtualLossCount, m1RealCount, m2RealCount, findM1Match, findM2Match, executeRealTrade, ensureConnection, simulateVirtualContract, localBalance]);

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
  const activeSymbol = currentMarket === 1 ? m1Symbol : m2Symbol;
  const activeDigits = (tickMapRef.current.get(activeSymbol) || []).slice(-8);
  const hasDetectedPatterns = detectedPatterns.length > 0;
  const dollarColors = ['text-emerald-400', 'text-cyan-400', 'text-amber-400', 'text-rose-400', 'text-purple-400', 'text-blue-400', 'text-indigo-400', 'text-pink-400'];

  const currentConfig = useMemo<BotConfig>(() => ({
    version: 1, botName,
    m1: { enabled: m1Enabled, symbol: m1Symbol, contract: m1Contract, barrier: m1Barrier, hookEnabled: m1HookEnabled, virtualLossCount: m1VirtualLossCount, realCount: m1RealCount },
    m2: { enabled: m2Enabled, symbol: m2Symbol, contract: m2Contract, barrier: m2Barrier, hookEnabled: m2HookEnabled, virtualLossCount: m2VirtualLossCount, realCount: m2RealCount },
    risk: { stake, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss },
    strategy: { m1Enabled: strategyM1Enabled, m2Enabled: strategyM2Enabled, m1Mode: m1StrategyMode, m2Mode: m2StrategyMode, m1Pattern, m1DigitCondition, m1DigitCompare, m1DigitWindow, m2Pattern, m2DigitCondition, m2DigitCompare, m2DigitWindow },
    scanner: { active: scannerActive }, turbo: { enabled: turboMode },
  }), [m1Enabled, m1Symbol, m1Contract, m1Barrier, m1HookEnabled, m1VirtualLossCount, m1RealCount, m2Enabled, m2Symbol, m2Contract, m2Barrier, m2HookEnabled, m2VirtualLossCount, m2RealCount, stake, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, strategyM1Enabled, strategyM2Enabled, m1StrategyMode, m2StrategyMode, m1Pattern, m1DigitCondition, m1DigitCompare, m1DigitWindow, m2Pattern, m2DigitCondition, m2DigitCompare, m2DigitWindow, scannerActive, turboMode, botName]);

  const handleLoadConfig = useCallback((cfg: BotConfig) => {
    if (cfg.m1) { if (cfg.m1.enabled !== undefined) setM1Enabled(cfg.m1.enabled); if (cfg.m1.symbol) setM1Symbol(cfg.m1.symbol); if (cfg.m1.contract) setM1Contract(cfg.m1.contract); if (cfg.m1.barrier) setM1Barrier(cfg.m1.barrier); if (cfg.m1.hookEnabled !== undefined) setM1HookEnabled(cfg.m1.hookEnabled); if (cfg.m1.virtualLossCount) setM1VirtualLossCount(cfg.m1.virtualLossCount); if (cfg.m1.realCount) setM1RealCount(cfg.m1.realCount); }
    if (cfg.m2) { if (cfg.m2.enabled !== undefined) setM2Enabled(cfg.m2.enabled); if (cfg.m2.symbol) setM2Symbol(cfg.m2.symbol); if (cfg.m2.contract) setM2Contract(cfg.m2.contract); if (cfg.m2.barrier) setM2Barrier(cfg.m2.barrier); if (cfg.m2.hookEnabled !== undefined) setM2HookEnabled(cfg.m2.hookEnabled); if (cfg.m2.virtualLossCount) setM2VirtualLossCount(cfg.m2.virtualLossCount); if (cfg.m2.realCount) setM2RealCount(cfg.m2.realCount); }
    if (cfg.risk) { if (cfg.risk.stake) setStake(cfg.risk.stake); if (cfg.risk.martingaleOn !== undefined) setMartingaleOn(cfg.risk.martingaleOn); if (cfg.risk.martingaleMultiplier) setMartingaleMultiplier(cfg.risk.martingaleMultiplier); if (cfg.risk.martingaleMaxSteps) setMartingaleMaxSteps(cfg.risk.martingaleMaxSteps); if (cfg.risk.takeProfit) setTakeProfit(cfg.risk.takeProfit); if (cfg.risk.stopLoss) setStopLoss(cfg.risk.stopLoss); }
    if (cfg.strategy) { if (cfg.strategy.m1Enabled !== undefined) setStrategyM1Enabled(cfg.strategy.m1Enabled); if (cfg.strategy.m2Enabled !== undefined) setStrategyM2Enabled(cfg.strategy.m2Enabled); if (cfg.strategy.m1Mode) setM1StrategyMode(cfg.strategy.m1Mode); if (cfg.strategy.m2Mode) setM2StrategyMode(cfg.strategy.m2Mode); if (cfg.strategy.m1Pattern !== undefined) setM1Pattern(cfg.strategy.m1Pattern); if (cfg.strategy.m1DigitCondition) setM1DigitCondition(cfg.strategy.m1DigitCondition); if (cfg.strategy.m1DigitCompare) setM1DigitCompare(cfg.strategy.m1DigitCompare); if (cfg.strategy.m1DigitWindow) setM1DigitWindow(cfg.strategy.m1DigitWindow); if (cfg.strategy.m2Pattern !== undefined) setM2Pattern(cfg.strategy.m2Pattern); if (cfg.strategy.m2DigitCondition) setM2DigitCondition(cfg.strategy.m2DigitCondition); if (cfg.strategy.m2DigitCompare) setM2DigitCompare(cfg.strategy.m2DigitCompare); if (cfg.strategy.m2DigitWindow) setM2DigitWindow(cfg.strategy.m2DigitWindow); }
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

  const getM1DisplayName = (type: M1StrategyType): string => {
    switch (type) {
      case 'over0_under9_1': return '🎯 Over 0 / Under 9 (1 tick)';
      case 'over0_under9_2': return '🎯 Over 0 / Under 9 (2 ticks)';
      case 'over0_under9_3': return '🎯 Over 0 / Under 9 (3 ticks)';
      case 'over0_under9_4': return '🎯 Over 0 / Under 9 (4 ticks)';
      case 'over1_under8_2': return '🎯 Over 1 / Under 8 (2 ticks)';
      case 'over1_under8_3': return '🎯 Over 1 / Under 8 (3 ticks)';
      case 'over1_under8_4': return '🎯 Over 1 / Under 8 (4 ticks)';
      case 'over2_under7_2': return '🎯 Over 2 / Under 7 (2 ticks)';
      case 'over2_under7_3': return '🎯 Over 2 / Under 7 (3 ticks)';
      case 'over2_under7_4': return '🎯 Over 2 / Under 7 (4 ticks)';
      case 'over2_under7_5': return '🎯 Over 2 / Under 7 (5 ticks)';
      case 'over3_under6_4': return '🎯 Over 3 / Under 6 (4 ticks)';
      case 'over4_under5_4': return '🎯 Over 4 / Under 5 (4 ticks)';
      case 'over4_under5_5': return '🎯 Over 4 / Under 5 (5 ticks)';
      case 'over4_under5_6': return '🎯 Over 4 / Under 5 (6 ticks)';
      case 'over4_under5_7': return '🎯 Over 4 / Under 5 (7 ticks)';
      default: return 'Select strategy';
    }
  };

  const getM2DisplayName = (type: M2RecoveryType): string => {
    switch (type) {
      case 'odd_even_3': return '🔄 Even / Odd (3 ticks)';
      case 'odd_even_4': return '🔄 Even / Odd (4 ticks)';
      case 'odd_even_5': return '🔄 Even / Odd (5 ticks)';
      case 'odd_even_6': return '🔄 Even / Odd (6 ticks)';
      case 'odd_even_7': return '🔄 Even / Odd (7 ticks)';
      case 'odd_even_8': return '🔄 Even / Odd (8 ticks)';
      case 'odd_even_9': return '🔄 Even / Odd (9 ticks)';
      case 'over4_under5_5': return '🎯 Over 4 / Under 5 (5 ticks)';
      case 'over4_under5_6': return '🎯 Over 4 / Under 5 (6 ticks)';
      case 'over4_under5_7': return '🎯 Over 4 / Under 5 (7 ticks)';
      case 'over4_under5_8': return '🎯 Over 4 / Under 5 (8 ticks)';
      case 'over4_under5_9': return '🎯 Over 4 / Under 5 (9 ticks)';
      case 'over3_under6_5': return '🎯 Over 3 / Under 6 (5 ticks)';
      case 'over3_under6_7': return '🎯 Over 3 / Under 6 (7 ticks)';
      case 'same_direction_3': return '🔢 Same Direction (3 ticks)';
      case 'same_direction_4': return '🔢 Same Direction (4 ticks)';
      case 'same_direction_5': return '🔢 Same Direction (5 ticks)';
      case 'same_direction_6': return '🔢 Same Direction (6 ticks)';
      case 'same_direction_7': return '🔢 Same Direction (7 ticks)';
      case 'same_direction_8': return '🔢 Same Direction (8 ticks)';
      case 'same_direction_9': return '🔢 Same Direction (9 ticks)';
      case 'same_direction_10': return '🔢 Same Direction (10 ticks)';
      default: return 'Select strategy';
    }
  };

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
            <div className="markets-list">{SCANNER_MARKETS.map(m => <Badge key={m.symbol} variant="outline" className={`market-badge ${tickMapRef.current.get(m.symbol)?.length ? 'active' : ''}`}>{m.name}</Badge>)}</div>
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
                <div>
                  <label className="text-[11px] text-slate-400 mb-1.5 block font-semibold">Strategy Mode</label>
                  <Select value={m1StrategyType} onValueChange={(v: M1StrategyType) => { setM1StrategyType(v); if (v !== 'disabled') setStrategyM1Enabled(true); }} disabled={isRunning}>
                    <SelectTrigger className="select-trigger"><SelectValue placeholder="Select strategy" /></SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      <SelectItem value="over0_under9_1">{getM1DisplayName('over0_under9_1')}</SelectItem>
                      <SelectItem value="over0_under9_2">{getM1DisplayName('over0_under9_2')}</SelectItem>
                      <SelectItem value="over0_under9_3">{getM1DisplayName('over0_under9_3')}</SelectItem>
                      <SelectItem value="over0_under9_4">{getM1DisplayName('over0_under9_4')}</SelectItem>
                      <SelectItem value="over1_under8_2">{getM1DisplayName('over1_under8_2')}</SelectItem>
                      <SelectItem value="over1_under8_3">{getM1DisplayName('over1_under8_3')}</SelectItem>
                      <SelectItem value="over1_under8_4">{getM1DisplayName('over1_under8_4')}</SelectItem>
                      <SelectItem value="over2_under7_2">{getM1DisplayName('over2_under7_2')}</SelectItem>
                      <SelectItem value="over2_under7_3">{getM1DisplayName('over2_under7_3')}</SelectItem>
                      <SelectItem value="over2_under7_4">{getM1DisplayName('over2_under7_4')}</SelectItem>
                      <SelectItem value="over2_under7_5">{getM1DisplayName('over2_under7_5')}</SelectItem>
                      <SelectItem value="over3_under6_4">{getM1DisplayName('over3_under6_4')}</SelectItem>
                      <SelectItem value="over4_under5_4">{getM1DisplayName('over4_under5_4')}</SelectItem>
                      <SelectItem value="over4_under5_5">{getM1DisplayName('over4_under5_5')}</SelectItem>
                      <SelectItem value="over4_under5_6">{getM1DisplayName('over4_under5_6')}</SelectItem>
                      <SelectItem value="over4_under5_7">{getM1DisplayName('over4_under5_7')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                <div>
                  <label className="text-[11px] text-slate-400 mb-1.5 block font-semibold">Recovery Strategy 🔥</label>
                  <Select value={m2RecoveryType} onValueChange={(v: M2RecoveryType) => { setM2RecoveryType(v); if (v !== 'disabled') setStrategyM2Enabled(true); }} disabled={isRunning}>
                    <SelectTrigger className="select-trigger"><SelectValue placeholder="Select strategy" /></SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      <SelectItem value="odd_even_3">{getM2DisplayName('odd_even_3')}</SelectItem>
                      <SelectItem value="odd_even_4">{getM2DisplayName('odd_even_4')}</SelectItem>
                      <SelectItem value="odd_even_5">{getM2DisplayName('odd_even_5')}</SelectItem>
                      <SelectItem value="odd_even_6">{getM2DisplayName('odd_even_6')}</SelectItem>
                      <SelectItem value="odd_even_7">{getM2DisplayName('odd_even_7')}</SelectItem>
                      <SelectItem value="odd_even_8">{getM2DisplayName('odd_even_8')}</SelectItem>
                      <SelectItem value="odd_even_9">{getM2DisplayName('odd_even_9')}</SelectItem>
                      <SelectItem value="over4_under5_5">{getM2DisplayName('over4_under5_5')}</SelectItem>
                      <SelectItem value="over4_under5_6">{getM2DisplayName('over4_under5_6')}</SelectItem>
                      <SelectItem value="over4_under5_7">{getM2DisplayName('over4_under5_7')}</SelectItem>
                      <SelectItem value="over4_under5_8">{getM2DisplayName('over4_under5_8')}</SelectItem>
                      <SelectItem value="over4_under5_9">{getM2DisplayName('over4_under5_9')}</SelectItem>
                      <SelectItem value="over3_under6_5">{getM2DisplayName('over3_under6_5')}</SelectItem>
                      <SelectItem value="over3_under6_7">{getM2DisplayName('over3_under6_7')}</SelectItem>
                      <SelectItem value="same_direction_3">{getM2DisplayName('same_direction_3')}</SelectItem>
                      <SelectItem value="same_direction_4">{getM2DisplayName('same_direction_4')}</SelectItem>
                      <SelectItem value="same_direction_5">{getM2DisplayName('same_direction_5')}</SelectItem>
                      <SelectItem value="same_direction_6">{getM2DisplayName('same_direction_6')}</SelectItem>
                      <SelectItem value="same_direction_7">{getM2DisplayName('same_direction_7')}</SelectItem>
                      <SelectItem value="same_direction_8">{getM2DisplayName('same_direction_8')}</SelectItem>
                      <SelectItem value="same_direction_9">{getM2DisplayName('same_direction_9')}</SelectItem>
                      <SelectItem value="same_direction_10">{getM2DisplayName('same_direction_10')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
            </div>
            
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
