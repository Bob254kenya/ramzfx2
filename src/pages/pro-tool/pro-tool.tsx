// TradeUiClone.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { ArrowUp, ArrowDown, Hash, Sigma, Dice5, Play, StopCircle, Trash2, Scan, Home, RefreshCw, Shield, Zap, Eye, Anchor, Download, Upload, X } from "lucide-react";
import { generateDerivApiInstance, V2GetActiveClientId, V2GetActiveToken } from '@/external/bot-skeleton/services/api/appId';
import { tradeOptionToBuy } from '@/external/bot-skeleton/services/tradeEngine/utils/helpers';
import { useStore } from '@/hooks/useStore';
import './pro-tool.scss';

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
  { symbol: 'R_10', name: 'Vol 10' },
  { symbol: 'R_25', name: 'Vol 25' },
  { symbol: 'R_50', name: 'Vol 50' },
  { symbol: 'R_75', name: 'Vol 75' },
  { symbol: 'R_100', name: 'Vol 100' },
  { symbol: '1HZ10V', name: 'V10 1s' },
  { symbol: '1HZ15V', name: 'V15 1s' },
  { symbol: '1HZ25V', name: 'V25 1s' },
  { symbol: '1HZ30V', name: 'V30 1s' },
  { symbol: '1HZ50V', name: 'V50 1s' },
  { symbol: '1HZ75V', name: 'V75 1s' },
  { symbol: '1HZ90V', name: 'V90 1s' },
  { symbol: '1HZ100V', name: 'V100 1s' },
];

const CONTRACT_TYPES = [
  'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER',
] as const;

const needsBarrier = (ct: string) => ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(ct);

// Helper Functions
const getLastDigit = (quote: number): number => {
  return Math.abs(Math.floor(quote)) % 10;
};

class CircularTickBuffer {
  private buffer: { digit: number; ts: number }[];
  private head = 0;
  private count = 0;
  constructor(private capacity = 1000) {
    this.buffer = new Array(capacity);
  }
  push(digit: number) {
    this.buffer[this.head] = { digit, ts: performance.now() };
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }
  last(n: number): number[] {
    const result: number[] = [];
    const start = (this.head - Math.min(n, this.count) + this.capacity) % this.capacity;
    for (let i = 0; i < Math.min(n, this.count); i++) {
      result.push(this.buffer[(start + i) % this.capacity].digit);
    }
    return result;
  }
  get size() { return this.count; }
}

// Simple Switch Component
const Switch = ({ checked, onCheckedChange, className = "" }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) => (
  <label className={`switch ${className}`}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
    <span className="slider"></span>
  </label>
);

// Badge Component
const Badge = ({ children, variant, className = "" }: { children: React.ReactNode; variant?: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }) => {
  const baseClass = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  const variants = {
    default: "bg-blue-500/20 text-blue-300",
    secondary: "bg-gray-700/50 text-gray-300",
    destructive: "bg-red-500/20 text-red-300",
    outline: "border border-gray-600 text-gray-300"
  };
  return <span className={`${baseClass} ${variants[variant || 'default']} ${className}`}>{children}</span>;
};

// Input Component
const Input = ({ type = "text", value, onChange, placeholder, className = "", disabled = false, min, max, step }: any) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`w-full rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-200 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${className}`}
    disabled={disabled}
    min={min}
    max={max}
    step={step}
  />
);

// Select Component
const Select = ({ value, onValueChange, children, disabled = false }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedChild = React.Children.toArray(children).find((child: any) => child.props.value === value);
  
  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-7 w-full items-center justify-between rounded-md border border-gray-700 bg-gray-800/50 px-3 py-1 text-xs text-gray-200 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span>{selectedChild ? (selectedChild as any).props.children : 'Select...'}</span>
        <span className="text-gray-400">▼</span>
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-700 bg-gray-800 shadow-lg">
          {React.Children.map(children, (child: any) => (
            <div
              className="cursor-pointer px-3 py-1 text-xs text-gray-300 hover:bg-gray-700"
              onClick={() => {
                onValueChange(child.props.value);
                setIsOpen(false);
              }}
            >
              {child.props.children}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SelectTrigger = ({ children, className = "" }: any) => <div className={className}>{children}</div>;
const SelectValue = ({ placeholder }: any) => <span className="text-gray-400">{placeholder}</span>;
const SelectContent = ({ children }: any) => <>{children}</>;
const SelectItem = ({ value, children }: any) => <div value={value}>{children}</div>;

// Textarea Component
const Textarea = ({ value, onChange, placeholder, className = "", disabled = false }: any) => (
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`w-full rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-200 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${className}`}
    disabled={disabled}
  />
);

// TP/SL Notification Component
const TPSLNotificationPopup = () => {
  const [notification, setNotification] = useState<{ type: 'tp' | 'sl'; message: string; amount?: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    (window as any).showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
      setNotification({ type, message, amount });
      setIsVisible(true);
      setIsExiting(false);
      
      const timeout = setTimeout(() => {
        handleClose();
      }, 8000);
      
      return () => clearTimeout(timeout);
    };
    
    return () => {
      delete (window as any).showTPNotification;
    };
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setNotification(null);
      setIsExiting(false);
    }, 300);
  };

  if (!isVisible || !notification) return null;

  const isTP = notification.type === 'tp';
  const amount = notification.amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className={`pointer-events-auto w-[350px] rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${isExiting ? 'opacity-0 translate-y-10' : 'opacity-100 translate-y-0'}`}>
        <div className={`relative w-full overflow-hidden ${isTP ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : 'bg-gradient-to-br from-rose-500 to-rose-700'}`}>
          <div className="relative w-full p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${isTP ? 'bg-emerald-400/30' : 'bg-rose-400/30'} shadow-lg backdrop-blur-sm`}>
                {isTP ? '🎉' : '😢'}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white">{isTP ? 'TAKE PROFIT!' : 'STOP LOSS!'}</h3>
                <p className="text-[8px] text-white/70">{new Date().toLocaleTimeString()}</p>
              </div>
              <button onClick={handleClose} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
            
            <p className="text-white text-xs font-medium text-center my-3">{notification.message}</p>
            {amount && (
              <p className={`text-xl font-bold text-center mb-3 ${isTP ? 'text-emerald-200' : 'text-rose-200'}`}>
                {isTP ? '+' : '-'}${Math.abs(amount).toFixed(2)}
              </p>
            )}
            
            <button onClick={handleClose} className={`w-full py-2 rounded-lg font-semibold text-xs transition-all duration-200 ${isTP ? 'bg-white/95 text-emerald-600 hover:bg-white' : 'bg-white/95 text-rose-600 hover:bg-white'}`}>
              OK
            </button>
          </div>
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
  const [turboLatency] = useState(0);
  const [ticksCaptured, setTicksCaptured] = useState(0);
  const [ticksMissed] = useState(0);
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
        
        // Setup tick subscription
        setupTickSubscription('R_100');
      } catch (err) {
        console.error('API init error:', err);
      }
    };
    
    initApi();
    
    return () => {
      if (apiRef.current) {
        apiRef.current.disconnect?.();
      }
    };
  }, []);
  
  const setupTickSubscription = async (symbol: string) => {
    if (!apiRef.current) return;
    
    try {
      if (tickStreamIdRef.current) {
        await apiRef.current.forget({ forget: tickStreamIdRef.current });
      }
      
      const { subscription } = await apiRef.current.send({ ticks: symbol, subscribe: 1 });
      if (subscription?.id) tickStreamIdRef.current = subscription.id;
      
      const onMessage = (data: any) => {
        if (data?.msg_type === 'tick' && data?.tick?.symbol === symbol) {
          const quote = data.tick.quote;
          const digit = getLastDigit(quote);
          setLastDigit(digit);
          setDigits(prev => [...prev.slice(-8), digit]);
          setTicksCaptured(prev => prev + 1);
          
          // Update tick map
          const map = tickMapRef.current;
          const arr = map.get(symbol) || [];
          arr.push(digit);
          if (arr.length > 200) arr.shift();
          map.set(symbol, arr);
          setTickCounts(prev => ({ ...prev, [symbol]: arr.length }));
        }
      };
      
      apiRef.current.connection?.addEventListener('message', onMessage);
    } catch (err) {
      console.error('Tick subscription error:', err);
    }
  };
  
  const updateBalanceImmediately = useCallback(async (pnl?: number): Promise<number> => {
    if (pnl !== undefined) {
      setLocalBalance(prev => prev + pnl);
      return localBalance + pnl;
    }
    return localBalance;
  }, [localBalance]);
  
  const ensureConnection = useCallback(async (): Promise<boolean> => {
    if (apiRef.current?.isConnected?.()) {
      setIsConnected(true);
      connectionRetryCountRef.current = 0;
      return true;
    }
    
    setBotStatus('reconnecting');
    
    for (let i = 0; i < MAX_CONNECTION_RETRIES; i++) {
      try {
        const token = V2GetActiveToken();
        if (token) {
          const { authorize } = await apiRef.current.authorize(token);
          if (authorize) {
            setIsConnected(true);
            setBotStatus('trading_m1');
            return true;
          }
        }
        await new Promise(r => setTimeout(r, 3000));
      } catch (error) {
        console.error(`Reconnection attempt ${i + 1} failed:`, error);
      }
    }
    
    setIsConnected(false);
    setBotStatus('idle');
    return false;
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
        case '>': return d > comp;
        case '<': return d < comp;
        case '>=': return d >= comp;
        case '<=': return d <= comp;
        case '==': return d === comp;
        default: return false;
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
    for (const m of SCANNER_MARKETS) {
      if (checkStrategyForMarket(m.symbol, market)) return m.symbol;
    }
    return null;
  }, [checkStrategyForMarket]);
  
  const waitForNextTick = useCallback((symbol: string): Promise<{ quote: number }> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ quote: 0 }), 5000);
      
      const onMessage = (data: any) => {
        if (data?.msg_type === 'tick' && data?.tick?.symbol === symbol) {
          clearTimeout(timeout);
          resolve({ quote: data.tick.quote });
        }
      };
      
      apiRef.current?.connection?.addEventListener('message', onMessage);
      setTimeout(() => {
        apiRef.current?.connection?.removeEventListener('message', onMessage);
      }, 5000);
    });
  }, []);
  
  const simulateVirtualContract = useCallback(async (contractType: string, barrier: string, symbol: string): Promise<{ won: boolean; digit: number }> => {
    return new Promise((resolve, reject) => {
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
      setTimeout(() => {
        apiRef.current?.connection?.removeEventListener('message', onMessage);
      }, 5000);
    });
  }, []);
  
  const purchaseContract = useCallback(async (params: any): Promise<any> => {
    if (!apiRef.current) throw new Error('API not initialized');
    
    const buy_req = tradeOptionToBuy(params.contract_type, {
      amount: params.amount,
      basis: 'stake',
      contractTypes: [params.contract_type],
      currency: accountCurrency,
      duration: 1,
      duration_unit: 't',
      symbol: params.symbol,
      ...(params.barrier && { barrier: params.barrier })
    });
    
    const { buy, error } = await apiRef.current.buy(buy_req);
    if (error) throw error;
    
    // Add to transactions
    try {
      transactions.onBotContractEvent({
        contract_id: buy?.contract_id,
        transaction_ids: { buy: buy?.transaction_id },
        buy_price: buy?.buy_price,
        currency: accountCurrency,
        contract_type: params.contract_type,
        underlying: params.symbol,
        date_start: Math.floor(Date.now() / 1000),
        status: 'open',
      } as any);
    } catch {}
    
    return { contractId: buy?.contract_id, buy };
  }, [accountCurrency, transactions]);
  
  const waitForContractResult = useCallback(async (contractId: string): Promise<{ status: string; profit: number; sellPrice: number }> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Contract result timeout')), 60000);
      
      const checkResult = async () => {
        try {
          const { proposal_open_contract } = await apiRef.current?.send({ proposal_open_contract: 1, contract_id: contractId });
          if (proposal_open_contract?.is_sold) {
            clearTimeout(timeout);
            resolve({
              status: proposal_open_contract.status === 'sold' && (proposal_open_contract.profit || 0) > 0 ? 'won' : 'lost',
              profit: proposal_open_contract.profit || 0,
              sellPrice: proposal_open_contract.sell_price || 0
            });
          } else {
            setTimeout(checkResult, 1000);
          }
        } catch (err) {
          setTimeout(checkResult, 1000);
        }
      };
      
      checkResult();
    });
  }, []);
  
  const executeRealTrade = useCallback(async (cfg: any, tradeSymbol: string, cStake: number, mStep: number, mkt: 1 | 2, currentBalance: number, currentPnl: number, baseStake: number) => {
    if (!apiRef.current?.isConnected?.()) {
      const connected = await ensureConnection();
      if (!connected) throw new Error('No connection available');
    }
    
    const logId = ++logIdRef.current;
    const now = new Date().toLocaleTimeString();
    
    setTotalStaked(prev => prev + cStake);
    setCurrentStakeState(cStake);
    
    setLogEntries(prev => [{
      id: logId,
      time: now,
      market: mkt === 1 ? 'M1' : 'M2',
      symbol: tradeSymbol,
      contract: cfg.contract,
      stake: cStake,
      martingaleStep: mStep,
      exitDigit: '...',
      result: 'Pending',
      pnl: 0,
      balance: currentBalance,
      switchInfo: '',
    }, ...prev].slice(0, 100));
    
    let inRecovery = mkt === 2;
    let updatedBalance = currentBalance;
    let updatedPnl = currentPnl;
    let won = false;
    
    try {
      if (!turboMode) await waitForNextTick(tradeSymbol);
      
      const buyParams: any = {
        contract_type: cfg.contract,
        symbol: tradeSymbol,
        amount: cStake,
      };
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
      
      if (won) {
        setWins(prev => prev + 1);
        newInRecovery = false;
        switchInfo = inRecovery ? '✓ Recovery WIN → Back to M1' : '→ Continue M1';
        newMStep = 0;
        newCStake = baseStake;
      } else {
        setLosses(prev => prev + 1);
        if (!inRecovery && m2Enabled) {
          newInRecovery = true;
          switchInfo = '✗ Loss → Switch to M2';
        } else {
          switchInfo = inRecovery ? '→ Stay M2' : '→ Continue M1';
        }
        if (martingaleOn) {
          const maxS = parseInt(martingaleMaxSteps) || 5;
          if (mStep < maxS) {
            newCStake = parseFloat((cStake * (parseFloat(martingaleMultiplier) || 2)).toFixed(2));
            newMStep++;
          } else {
            newMStep = 0;
            newCStake = baseStake;
          }
        }
      }
      
      setMartingaleStepState(newMStep);
      setCurrentStakeState(newCStake);
      
      setLogEntries(prev => prev.map(e => e.id === logId ? { ...e, exitDigit, result: won ? 'Win' : 'Loss', pnl, balance: updatedBalance, switchInfo } : e));
      
      let shouldBreak = false;
      const tpValue = parseFloat(takeProfit);
      const slValue = parseFloat(stopLoss);
      
      if (updatedPnl >= tpValue) {
        (window as any).showTPNotification?.('tp', `Take Profit Target Hit!`, updatedPnl);
        shouldBreak = true;
        shouldStopRef.current = true;
      }
      if (updatedPnl <= -slValue) {
        (window as any).showTPNotification?.('sl', `Stop Loss Target Hit!`, Math.abs(updatedPnl));
        shouldBreak = true;
        shouldStopRef.current = true;
      }
      if (updatedBalance < newCStake) {
        shouldBreak = true;
        shouldStopRef.current = true;
      }
      
      return { localPnl: updatedPnl, localBalance: updatedBalance, cStake: newCStake, mStep: newMStep, inRecovery: newInRecovery, shouldBreak, won };
    } catch (err: any) {
      console.error('Trade execution error:', err);
      setLogEntries(prev => prev.map(e => e.id === logId ? { ...e, result: 'Loss', pnl: 0, exitDigit: '-', switchInfo: `Error: ${err.message}` } : e));
      return { localPnl: updatedPnl, localBalance: updatedBalance, cStake, mStep, inRecovery, shouldBreak: false, won: false };
    }
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
    
    const getConfig = (market: 1 | 2) => ({
      contract: market === 1 ? m1Contract : m2Contract,
      barrier: market === 1 ? m1Barrier : m2Barrier,
      symbol: market === 1 ? m1Symbol : m2Symbol,
    });
    
    while (runningRef.current && !shouldStopRef.current) {
      if (currentPnl >= parseFloat(takeProfit) || currentPnl <= -parseFloat(stopLoss)) {
        shouldStopRef.current = true;
        break;
      }
      
      if (!apiRef.current?.isConnected?.()) {
        const reconnected = await ensureConnection();
        if (!reconnected) break;
      }
      
      const mkt: 1 | 2 = inRecovery ? 2 : 1;
      setCurrentMarket(mkt);
      
      if (mkt === 1 && !m1Enabled) {
        if (m2Enabled) { inRecovery = true; continue; }
        else break;
      }
      if (mkt === 2 && !m2Enabled) {
        inRecovery = false;
        continue;
      }
      
      let tradeSymbol: string;
      const cfg = getConfig(mkt);
      const hookEnabled = mkt === 1 ? m1HookEnabled : m2HookEnabled;
      const requiredLosses = parseInt(mkt === 1 ? m1VirtualLossCount : m2VirtualLossCount) || 3;
      const realCount = parseInt(mkt === 1 ? m1RealCount : m2RealCount) || 2;
      
      if ((mkt === 2 && strategyEnabled) || (mkt === 1 && strategyM1Enabled)) {
        patternTradeTakenRef.current = false;
      }
      
      // Pattern matching logic
      if (inRecovery && strategyEnabled) {
        setBotStatus('waiting_pattern');
        let matched = false;
        let matchedSymbol = '';
        let attempts = 0;
        const MAX_ATTEMPTS = 100;
        
        while (runningRef.current && !matched && attempts < MAX_ATTEMPTS && !shouldStopRef.current) {
          if (scannerActive) {
            const found = findScannerMatchForMarket(2);
            if (found) { matched = true; matchedSymbol = found; }
          } else {
            if (checkStrategyForMarket(cfg.symbol, 2)) { matched = true; matchedSymbol = cfg.symbol; }
          }
          if (!matched) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
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
          if (checkStrategyForMarket(cfg.symbol, 1)) { matched = true; }
          if (!matched) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
        }
        if (!runningRef.current || !matched || shouldStopRef.current) continue;
        
        setBotStatus('pattern_matched');
        tradeSymbol = cfg.symbol;
        await new Promise(r => setTimeout(r, 300));
      } else {
        setBotStatus(mkt === 1 ? 'trading_m1' : 'recovery');
        tradeSymbol = cfg.symbol;
      }
      
      if (shouldStopRef.current) break;
      
      if (((inRecovery && strategyEnabled) || (!inRecovery && strategyM1Enabled)) && patternTradeTakenRef.current) {
        patternTradeTakenRef.current = false;
        continue;
      }
      
      // VIRTUAL HOOK LOGIC
      if (hookEnabled) {
        setBotStatus('virtual_hook');
        setVhStatus('waiting');
        setVhFakeWins(0);
        setVhFakeLosses(0);
        setVhConsecLosses(0);
        let consecLosses = 0;
        let virtualTradeNum = 0;
        
        while (consecLosses < requiredLosses && runningRef.current && !shouldStopRef.current) {
          virtualTradeNum++;
          const vLogId = ++logIdRef.current;
          const vNow = new Date().toLocaleTimeString();
          setLogEntries(prev => [{
            id: vLogId,
            time: vNow,
            market: 'VH',
            symbol: tradeSymbol,
            contract: cfg.contract,
            stake: 0,
            martingaleStep: 0,
            exitDigit: '...',
            result: 'Pending',
            pnl: 0,
            balance: currentBalanceLocal,
            switchInfo: `Virtual #${virtualTradeNum} (losses: ${consecLosses}/${requiredLosses})`,
          }, ...prev].slice(0, 100));
          
          try {
            const vResult = await simulateVirtualContract(cfg.contract, cfg.barrier, tradeSymbol);
            if (!runningRef.current || shouldStopRef.current) break;
            
            if (vResult.won) {
              consecLosses = 0;
              setVhConsecLosses(0);
              setVhFakeWins(prev => prev + 1);
              setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, exitDigit: String(vResult.digit), result: 'V-Win', switchInfo: `Virtual WIN → Losses reset (0/${requiredLosses})` } : e));
            } else {
              consecLosses++;
              setVhConsecLosses(consecLosses);
              setVhFakeLosses(prev => prev + 1);
              setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, exitDigit: String(vResult.digit), result: 'V-Loss', switchInfo: `Virtual LOSS (${consecLosses}/${requiredLosses})` } : e));
            }
          } catch (err) {
            console.error('Virtual simulation error:', err);
            setLogEntries(prev => prev.map(e => e.id === vLogId ? { ...e, result: 'V-Loss', exitDigit: '-', switchInfo: `Error: ${err}` } : e));
            break;
          }
        }
        
        if (!runningRef.current || shouldStopRef.current) break;
        
        setVhStatus('confirmed');
        
        let winOccurred = false;
        
        for (let ri = 0; ri < realCount && runningRef.current && !winOccurred && !shouldStopRef.current; ri++) {
          const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalanceLocal, currentPnl, baseStake);
          if (!result || !runningRef.current) break;
          
          currentPnl = result.localPnl;
          currentBalanceLocal = result.localBalance;
          cStake = result.cStake;
          mStep = result.mStep;
          inRecovery = result.inRecovery;
          
          if (result.shouldBreak) {
            shouldStopRef.current = true;
            runningRef.current = false;
            break;
          }
          
          if (result.won) {
            winOccurred = true;
            const winLogId = ++logIdRef.current;
            setLogEntries(prev => [{
              id: winLogId,
              time: new Date().toLocaleTimeString(),
              market: 'VH',
              symbol: tradeSymbol,
              contract: cfg.contract,
              stake: 0,
              martingaleStep: 0,
              exitDigit: '-',
              result: 'Pending',
              pnl: 0,
              balance: currentBalanceLocal,
              switchInfo: `✅ REAL WIN DETECTED! Immediate exit from hook mode.`,
            }, ...prev].slice(0, 100));
            break;
          }
        }
        
        setVhStatus('idle');
        setVhConsecLosses(0);
        
        if ((inRecovery && strategyEnabled) || (!inRecovery && strategyM1Enabled)) {
          patternTradeTakenRef.current = true;
        }
        
        if (!runningRef.current || shouldStopRef.current) break;
        continue;
      }
      
      // NON-HOOK MODE
      const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalanceLocal, currentPnl, baseStake);
      if (!result || !runningRef.current) break;
      
      currentPnl = result.localPnl;
      currentBalanceLocal = result.localBalance;
      cStake = result.cStake;
      mStep = result.mStep;
      inRecovery = result.inRecovery;
      
      if (result.shouldBreak) {
        shouldStopRef.current = true;
        break;
      }
      
      if ((inRecovery && strategyEnabled) || (!inRecovery && strategyM1Enabled)) {
        patternTradeTakenRef.current = true;
      }
      
      if (!turboMode) await new Promise(r => setTimeout(r, 400));
    }
    
    setIsRunning(false);
    runningRef.current = false;
    setBotStatus('idle');
    patternTradeTakenRef.current = false;
    shouldStopRef.current = false;
  }, [isRunning, stake, m1Enabled, m2Enabled, m1Contract, m2Contract, m1Barrier, m2Barrier, m1Symbol, m2Symbol, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, strategyEnabled, strategyM1Enabled, m1StrategyMode, m2StrategyMode, scannerActive, findScannerMatchForMarket, checkStrategyForMarket, turboMode, m1HookEnabled, m2HookEnabled, m1VirtualLossCount, m2VirtualLossCount, m1RealCount, m2RealCount, ensureConnection, executeRealTrade, localBalance]);
  
  const stopBot = useCallback(() => {
    shouldStopRef.current = true;
    runningRef.current = false;
    setIsRunning(false);
    setBotStatus('idle');
    patternTradeTakenRef.current = false;
  }, []);
  
  const clearLog = useCallback(() => {
    setLogEntries([]);
    setWins(0);
    setLosses(0);
    setTotalStaked(0);
    setNetProfit(0);
    setMartingaleStepState(0);
    setVhFakeWins(0);
    setVhFakeLosses(0);
    setVhConsecLosses(0);
    setVhStatus('idle');
    setTicksCaptured(0);
    patternTradeTakenRef.current = false;
    shouldStopRef.current = false;
  }, []);
  
  const statusConfig: Record<BotStatus, { icon: string; label: string; color: string }> = {
    idle: { icon: '⚪', label: 'IDLE', color: 'text-gray-400' },
    trading_m1: { icon: '🟢', label: 'TRADING M1', color: 'text-emerald-400' },
    recovery: { icon: '🟣', label: 'RECOVERY MODE', color: 'text-purple-400' },
    waiting_pattern: { icon: '🟡', label: 'WAITING PATTERN', color: 'text-yellow-400' },
    pattern_matched: { icon: '✅', label: 'PATTERN MATCHED', color: 'text-emerald-400' },
    virtual_hook: { icon: '🎣', label: 'VIRTUAL HOOK', color: 'text-blue-400' },
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
  
  return (
    <>
      <div className="pro-scanner-bot">
        {/* Header */}
        <div className="scanner-header">
          <div className="header-left">
            <div className="logo-icon">
              <Scan size={24} />
            </div>
            <div>
              <h1>Milliefx Pro Scanner Bot</h1>
              <p>Advanced Market Scanning & Recovery System</p>
            </div>
          </div>
          <div className="header-right">
            <Badge className={`${status.color}`}>
              {status.icon} {status.label}
            </Badge>
            {isRunning && (
              <Badge variant="outline">
                P/L: ${netProfit.toFixed(2)}
              </Badge>
            )}
            {!isConnected && (
              <Badge variant="destructive">
                🔌 DISCONNECTED
              </Badge>
            )}
          </div>
        </div>
        
        {/* Scanner + Turbo + Stats Row */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <Eye size={14} />
              <span>Scan All Markets</span>
              <Badge variant={scannerActive ? 'default' : 'secondary'}>{scannerActive ? '🟢 ON' : '⚫ OFF'}</Badge>
            </div>
            <div className="market-tags">
              {SCANNER_MARKETS.map(m => (
                <span key={m.symbol} className={`market-tag ${tickCounts[m.symbol] ? 'active' : ''}`}>{m.name}</span>
              ))}
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-header">
              <Zap size={14} className={turboMode ? 'text-emerald-400' : ''} />
              <span>Turbo Mode</span>
              <button className={`turbo-btn ${turboMode ? 'active' : ''}`} onClick={() => setTurboMode(!turboMode)} disabled={isRunning}>
                {turboMode ? '⚡ ON' : 'OFF'}
              </button>
            </div>
            <div className="turbo-stats">
              <div><span>Latency</span><strong>{turboLatency}ms</strong></div>
              <div><span>Captured</span><strong>{ticksCaptured}</strong></div>
              <div><span>Missed</span><strong>{ticksMissed}</strong></div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-header">
              <span>Live Stats</span>
              <strong className="text-blue-400">${localBalance.toFixed(2)}</strong>
            </div>
            <div className="live-stats">
              <div><span>W/L</span><strong><span className="text-emerald-400">{wins}</span>/<span className="text-red-400">{losses}</span></strong></div>
              <div><span>P/L</span><strong className={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>${netProfit.toFixed(2)}</strong></div>
              <div><span>Stake</span><strong>${currentStake.toFixed(2)}{martingaleStep > 0 && <span className="text-yellow-400 ml-1">M{martingaleStep}</span>}</strong></div>
            </div>
          </div>
        </div>
        
        {/* Main 2-Column Layout */}
        <div className="main-layout">
          {/* LEFT: Config Column */}
          <div className="config-column">
            {/* M1 Card */}
            <div className="market-card m1-card">
              <div className="card-header">
                <h3><Home size={14} /> M1 — Home</h3>
                <Switch checked={m1Enabled} onCheckedChange={setM1Enabled} disabled={isRunning} />
              </div>
              <Select value={m1Symbol} onValueChange={setM1Symbol} disabled={isRunning}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SCANNER_MARKETS.map(m => <SelectItem key={m.symbol} value={m.symbol}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={m1Contract} onValueChange={setM1Contract} disabled={isRunning}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTRACT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {needsBarrier(m1Contract) && (
                <Input type="number" min="0" max="9" value={m1Barrier} onChange={e => setM1Barrier(e.target.value)} disabled={isRunning} />
              )}
              <div className="hook-section">
                <div className="hook-header">
                  <span><Anchor size={12} /> Virtual Hook</span>
                  <Switch checked={m1HookEnabled} onCheckedChange={setM1HookEnabled} disabled={isRunning} />
                </div>
                {m1HookEnabled && (
                  <div className="hook-inputs">
                    <div><label>V-Losses</label><Input type="number" min="1" max="20" value={m1VirtualLossCount} onChange={e => setM1VirtualLossCount(e.target.value)} disabled={isRunning} /></div>
                    <div><label>Real Trades</label><Input type="number" min="1" max="10" value={m1RealCount} onChange={e => setM1RealCount(e.target.value)} disabled={isRunning} /></div>
                  </div>
                )}
              </div>
            </div>
            
            {/* M2 Card */}
            <div className="market-card m2-card">
              <div className="card-header">
                <h3><RefreshCw size={14} /> M2 — Recovery</h3>
                <Switch checked={m2Enabled} onCheckedChange={setM2Enabled} disabled={isRunning} />
              </div>
              <Select value={m2Symbol} onValueChange={setM2Symbol} disabled={isRunning}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SCANNER_MARKETS.map(m => <SelectItem key={m.symbol} value={m.symbol}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={m2Contract} onValueChange={setM2Contract} disabled={isRunning}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTRACT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {needsBarrier(m2Contract) && (
                <Input type="number" min="0" max="9" value={m2Barrier} onChange={e => setM2Barrier(e.target.value)} disabled={isRunning} />
              )}
              <div className="hook-section">
                <div className="hook-header">
                  <span><Anchor size={12} /> Virtual Hook</span>
                  <Switch checked={m2HookEnabled} onCheckedChange={setM2HookEnabled} disabled={isRunning} />
                </div>
                {m2HookEnabled && (
                  <div className="hook-inputs">
                    <div><label>V-Losses</label><Input type="number" min="1" max="20" value={m2VirtualLossCount} onChange={e => setM2VirtualLossCount(e.target.value)} disabled={isRunning} /></div>
                    <div><label>Real Trades</label><Input type="number" min="1" max="10" value={m2RealCount} onChange={e => setM2RealCount(e.target.value)} disabled={isRunning} /></div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Virtual Hook Stats */}
            {(m1HookEnabled || m2HookEnabled) && (
              <div className="hook-stats">
                <h3><Anchor size={12} /> Hook Status</h3>
                <div className="hook-stats-grid">
                  <div><span>V-Win</span><strong className="text-emerald-400">{vhFakeWins}</strong></div>
                  <div><span>V-Loss</span><strong className="text-red-400">{vhFakeLosses}</strong></div>
                  <div><span>Streak</span><strong className="text-yellow-400">{vhConsecLosses}</strong></div>
                  <div><span>State</span><strong className={vhStatus === 'confirmed' ? 'text-emerald-400' : vhStatus === 'waiting' ? 'text-yellow-400' : ''}>{vhStatus === 'confirmed' ? '✓' : vhStatus === 'waiting' ? '⏳' : '—'}</strong></div>
                </div>
              </div>
            )}
            
            {/* Risk Management */}
            <div className="risk-card">
              <h3><Shield size={14} /> Risk Management</h3>
              <div className="risk-grid">
                <div><label>Stake ($)</label><Input type="number" min="0.35" step="0.01" value={stake} onChange={e => setStake(e.target.value)} disabled={isRunning} /></div>
                <div><label>Take Profit</label><Input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={isRunning} /></div>
                <div><label>Stop Loss</label><Input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={isRunning} /></div>
              </div>
              <div className="martingale-row">
                <label>Martingale</label>
                <Switch checked={martingaleOn} onCheckedChange={setMartingaleOn} disabled={isRunning} />
              </div>
              {martingaleOn && (
                <div className="martingale-grid">
                  <div><label>Multiplier</label><Input type="number" min="1.1" step="0.1" value={martingaleMultiplier} onChange={e => setMartingaleMultiplier(e.target.value)} disabled={isRunning} /></div>
                  <div><label>Max Steps</label><Input type="number" min="1" max="10" value={martingaleMaxSteps} onChange={e => setMartingaleMaxSteps(e.target.value)} disabled={isRunning} /></div>
                </div>
              )}
              <div className="strategy-checkboxes">
                <label><input type="checkbox" checked={strategyM1Enabled} onChange={e => setStrategyM1Enabled(e.target.checked)} disabled={isRunning} /> Strategy M1</label>
                <label><input type="checkbox" checked={strategyEnabled} onChange={e => setStrategyEnabled(e.target.checked)} disabled={isRunning} /> Strategy M2</label>
              </div>
            </div>
            
            {/* Strategy Card */}
            {(strategyEnabled || strategyM1Enabled) && (
              <div className="strategy-card">
                <h3><Zap size={14} /> Strategy Conditions</h3>
                {strategyM1Enabled && (
                  <div className="strategy-subcard m1-strategy">
                    <div className="strategy-header">
                      <label>M1 Strategy</label>
                      <div>
                        <button className={`strategy-mode ${m1StrategyMode === 'pattern' ? 'active' : ''}`} onClick={() => setM1StrategyMode('pattern')} disabled={isRunning}>Pattern</button>
                        <button className={`strategy-mode ${m1StrategyMode === 'digit' ? 'active' : ''}`} onClick={() => setM1StrategyMode('digit')} disabled={isRunning}>Digit</button>
                      </div>
                    </div>
                    {m1StrategyMode === 'pattern' ? (
                      <>
                        <Textarea placeholder="E=Even O=Odd e.g. EEEOE" value={m1Pattern} onChange={e => setM1Pattern(e.target.value.toUpperCase().replace(/[^EO]/g, ''))} disabled={isRunning} />
                        <div className={`pattern-status ${m1PatternValid ? 'valid' : 'invalid'}`}>
                          {cleanM1Pattern.length === 0 ? 'Enter pattern...' : m1PatternValid ? `✓ ${cleanM1Pattern}` : `✗ Need 2+`}
                        </div>
                      </>
                    ) : (
                      <div className="digit-grid">
                        <Input type="number" min="1" max="50" value={m1DigitWindow} onChange={e => setM1DigitWindow(e.target.value)} disabled={isRunning} placeholder="Window" />
                        <Select value={m1DigitCondition} onValueChange={setM1DigitCondition} disabled={isRunning}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{['==', '>', '<', '>=', '<='].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" min="0" max="9" value={m1DigitCompare} onChange={e => setM1DigitCompare(e.target.value)} disabled={isRunning} placeholder="Digit" />
                      </div>
                    )}
                  </div>
                )}
                {strategyEnabled && (
                  <div className="strategy-subcard m2-strategy">
                    <div className="strategy-header">
                      <label>M2 Strategy</label>
                      <div>
                        <button className={`strategy-mode ${m2StrategyMode === 'pattern' ? 'active' : ''}`} onClick={() => setM2StrategyMode('pattern')} disabled={isRunning}>Pattern</button>
                        <button className={`strategy-mode ${m2StrategyMode === 'digit' ? 'active' : ''}`} onClick={() => setM2StrategyMode('digit')} disabled={isRunning}>Digit</button>
                      </div>
                    </div>
                    {m2StrategyMode === 'pattern' ? (
                      <>
                        <Textarea placeholder="E=Even O=Odd e.g. OOEEO" value={m2Pattern} onChange={e => setM2Pattern(e.target.value.toUpperCase().replace(/[^EO]/g, ''))} disabled={isRunning} />
                        <div className={`pattern-status ${m2PatternValid ? 'valid' : 'invalid'}`}>
                          {cleanM2Pattern.length === 0 ? 'Enter pattern...' : m2PatternValid ? `✓ ${cleanM2Pattern}` : `✗ Need 2+`}
                        </div>
                      </>
                    ) : (
                      <div className="digit-grid">
                        <Input type="number" min="1" max="50" value={m2DigitWindow} onChange={e => setM2DigitWindow(e.target.value)} disabled={isRunning} placeholder="Window" />
                        <Select value={m2DigitCondition} onValueChange={setM2DigitCondition} disabled={isRunning}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{['==', '>', '<', '>=', '<='].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" min="0" max="9" value={m2DigitCompare} onChange={e => setM2DigitCompare(e.target.value)} disabled={isRunning} placeholder="Digit" />
                      </div>
                    )}
                  </div>
                )}
                {botStatus === 'waiting_pattern' && (
                  <div className="status-message waiting">⏳ WAITING FOR PATTERN...</div>
                )}
                {botStatus === 'pattern_matched' && (
                  <div className="status-message matched">✅ PATTERN MATCHED! Taking trade...</div>
                )}
              </div>
            )}
            
            {/* Config Save/Load */}
            <div className="config-card">
              <h3>💾 Bot Config</h3>
              <Input placeholder="Enter bot name..." value={botName} onChange={e => setBotName(e.target.value)} disabled={isRunning} />
              <div className="config-buttons">
                <button disabled={isRunning || !botName.trim()} onClick={() => {
                  const safeName = botName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
                  const config = { version: 1, botName: botName.trim(), m1: { enabled: m1Enabled, symbol: m1Symbol, contract: m1Contract, barrier: m1Barrier, hookEnabled: m1HookEnabled, virtualLossCount: m1VirtualLossCount, realCount: m1RealCount }, m2: { enabled: m2Enabled, symbol: m2Symbol, contract: m2Contract, barrier: m2Barrier, hookEnabled: m2HookEnabled, virtualLossCount: m2VirtualLossCount, realCount: m2RealCount }, risk: { stake, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss }, strategy: { m1Enabled: strategyM1Enabled, m2Enabled: strategyEnabled, m1Mode: m1StrategyMode, m2Mode: m2StrategyMode, m1Pattern, m1DigitCondition, m1DigitCompare, m1DigitWindow, m2Pattern, m2DigitCondition, m2DigitCompare, m2DigitWindow }, scanner: { active: scannerActive }, turbo: { enabled: turboMode } };
                  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `${safeName}_${ts}.json`; a.click();
                  URL.revokeObjectURL(url);
                }}>
                  <Download size={12} /> Save
                </button>
                <button disabled={isRunning} onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = '.json';
                  input.onchange = (ev: any) => {
                    const file = ev.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      try {
                        const cfg = JSON.parse(e.target?.result as string);
                        if (cfg.m1 && cfg.m2 && cfg.risk) {
                          if (cfg.m1.enabled !== undefined) setM1Enabled(cfg.m1.enabled);
                          if (cfg.m1.symbol) setM1Symbol(cfg.m1.symbol);
                          if (cfg.m1.contract) setM1Contract(cfg.m1.contract);
                          if (cfg.m1.barrier) setM1Barrier(cfg.m1.barrier);
                          if (cfg.m1.hookEnabled !== undefined) setM1HookEnabled(cfg.m1.hookEnabled);
                          if (cfg.m1.virtualLossCount) setM1VirtualLossCount(cfg.m1.virtualLossCount);
                          if (cfg.m1.realCount) setM1RealCount(cfg.m1.realCount);
                          if (cfg.m2.enabled !== undefined) setM2Enabled(cfg.m2.enabled);
                          if (cfg.m2.symbol) setM2Symbol(cfg.m2.symbol);
                          if (cfg.m2.contract) setM2Contract(cfg.m2.contract);
                          if (cfg.m2.barrier) setM2Barrier(cfg.m2.barrier);
                          if (cfg.m2.hookEnabled !== undefined) setM2HookEnabled(cfg.m2.hookEnabled);
                          if (cfg.m2.virtualLossCount) setM2VirtualLossCount(cfg.m2.virtualLossCount);
                          if (cfg.m2.realCount) setM2RealCount(cfg.m2.realCount);
                          if (cfg.risk.stake) setStake(cfg.risk.stake);
                          if (cfg.risk.martingaleOn !== undefined) setMartingaleOn(cfg.risk.martingaleOn);
                          if (cfg.risk.martingaleMultiplier) setMartingaleMultiplier(cfg.risk.martingaleMultiplier);
                          if (cfg.risk.martingaleMaxSteps) setMartingaleMaxSteps(cfg.risk.martingaleMaxSteps);
                          if (cfg.risk.takeProfit) setTakeProfit(cfg.risk.takeProfit);
                          if (cfg.risk.stopLoss) setStopLoss(cfg.risk.stopLoss);
                          if (cfg.strategy) {
                            if (cfg.strategy.m1Enabled !== undefined) setStrategyM1Enabled(cfg.strategy.m1Enabled);
                            if (cfg.strategy.m2Enabled !== undefined) setStrategyEnabled(cfg.strategy.m2Enabled);
                            if (cfg.strategy.m1Mode) setM1StrategyMode(cfg.strategy.m1Mode);
                            if (cfg.strategy.m2Mode) setM2StrategyMode(cfg.strategy.m2Mode);
                            if (cfg.strategy.m1Pattern !== undefined) setM1Pattern(cfg.strategy.m1Pattern);
                            if (cfg.strategy.m1DigitCondition) setM1DigitCondition(cfg.strategy.m1DigitCondition);
                            if (cfg.strategy.m1DigitCompare) setM1DigitCompare(cfg.strategy.m1DigitCompare);
                            if (cfg.strategy.m1DigitWindow) setM1DigitWindow(cfg.strategy.m1DigitWindow);
                            if (cfg.strategy.m2Pattern !== undefined) setM2Pattern(cfg.strategy.m2Pattern);
                            if (cfg.strategy.m2DigitCondition) setM2DigitCondition(cfg.strategy.m2DigitCondition);
                            if (cfg.strategy.m2DigitCompare) setM2DigitCompare(cfg.strategy.m2DigitCompare);
                            if (cfg.strategy.m2DigitWindow) setM2DigitWindow(cfg.strategy.m2DigitWindow);
                          }
                          if (cfg.scanner?.active !== undefined) setScannerActive(cfg.scanner.active);
                          if (cfg.turbo?.enabled !== undefined) setTurboMode(cfg.turbo.enabled);
                          if (cfg.botName) setBotName(cfg.botName);
                        }
                      } catch {}
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}>
                  <Upload size={12} /> Load
                </button>
              </div>
            </div>
          </div>
          
          {/* RIGHT: Digit Stream + Activity Log */}
          <div className="right-column">
            {/* Live Digits */}
            <div className="digits-card">
              <div className="digits-header">
                <h3>Live Digits — {activeSymbol}</h3>
                <span>Win Rate: {winRate}% | Staked: ${totalStaked.toFixed(2)}</span>
              </div>
              <div className="digits-container">
                {activeDigits.length === 0 ? (
                  <span className="waiting-text">Waiting for ticks...</span>
                ) : activeDigits.map((d, i) => {
                  const isOver = d >= 5;
                  const isLast = i === activeDigits.length - 1;
                  return (
                    <div key={i} className={`digit-box ${isOver ? 'over' : 'under'} ${isLast ? 'last' : ''}`}>
                      <span className="digit">{d}</span>
                      <span className="type">{isOver ? 'O' : 'U'}{d % 2 === 0 ? 'E' : 'O'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Animated Start/Stop Button */}
            <button className={`action-btn ${isRunning ? 'stop' : 'start'}`} onClick={isRunning ? stopBot : startBot} disabled={!isRunning && (!isConnected || localBalance < parseFloat(stake))}>
              {isRunning ? (
                <>
                  <StopCircle size={24} />
                  STOP BOT
                  <span className="pulse-dots">
                    <span className="dot" /><span className="dot" /><span className="dot" />
                  </span>
                </>
              ) : (
                <>
                  <Play size={24} />
                  START BOT
                </>
              )}
            </button>
            
            {/* Live Status Panel */}
            <div className="live-status">
              <h3><Zap size={14} /> Live Status (Realtime)</h3>
              <div className="status-grid">
                <div><span>Status</span><strong className={status.color}>{status.icon} {status.label}</strong></div>
                <div><span>Market</span><strong className={currentMarket === 1 ? 'text-emerald-400' : 'text-purple-400'}>{currentMarket === 1 ? 'M1 (HOME)' : 'M2 (RECOVERY)'}</strong></div>
                <div><span>Win Rate</span><strong>{winRate}%</strong></div>
                <div><span>Current P/L</span><strong className={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>${netProfit.toFixed(2)}</strong></div>
                <div><span>Current Stake</span><strong>${currentStake.toFixed(2)}{martingaleStep > 0 && <span className="text-yellow-400 ml-1">M{martingaleStep}</span>}</strong></div>
                <div><span>Balance</span><strong className="text-blue-400">${localBalance.toFixed(2)}</strong></div>
                <div><span>Total Staked</span><strong>${totalStaked.toFixed(2)}</strong></div>
                <div><span>W/L (Session)</span><strong><span className="text-emerald-400">{wins}</span>/<span className="text-red-400">{losses}</span></strong></div>
              </div>
              {botStatus === 'virtual_hook' && (
                <div className="status-banner hook">
                  <Anchor size={12} /> Virtual Hook Active — Waiting for {m1HookEnabled ? m1VirtualLossCount : m2VirtualLossCount} consecutive losses... ({vhConsecLosses}/{m1HookEnabled ? m1VirtualLossCount : m2VirtualLossCount})
                </div>
              )}
              {botStatus === 'waiting_pattern' && (
                <div className="status-banner waiting">
                  <Scan size={12} /> Scanning for pattern match...
                </div>
              )}
            </div>
            
            {/* Activity Log */}
            <div className="activity-log">
              <div className="log-header">
                <h3><RefreshCw size={14} /> Activity Log</h3>
                <div className="log-actions">
                  {logEntries.length > 0 && logEntries[0].switchInfo && (
                    <span className="log-info">📊 {logEntries[0].switchInfo}</span>
                  )}
                  <button onClick={clearLog}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="log-table-container">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Time</th><th>Mkt</th><th>Symbol</th><th>Type</th><th>Stake</th><th>Digit</th><th>Result</th><th>P/L</th><th>Bal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logEntries.length === 0 ? (
                      <tr><td colSpan={9} className="empty-log"><Zap size={32} />No trades yet — configure and start the bot</td></tr>
                    ) : logEntries.map(e => (
                      <tr key={e.id} className={`log-row ${e.market === 'M1' ? 'm1' : e.market === 'VH' ? 'vh' : 'm2'}`}>
                        <td>{e.time}</td>
                        <td className={e.market === 'M1' ? 'text-emerald-400' : e.market === 'VH' ? 'text-blue-400' : 'text-purple-400'}>{e.market}</td>
                        <td>{e.symbol}</td>
                        <td>{e.contract.replace('DIGIT', '')}</td>
                        <td>{e.market === 'VH' ? <span className="vh-stake">FAKE</span> : `$${e.stake.toFixed(2)}`}{e.martingaleStep > 0 && e.market !== 'VH' && <span className="martingale-step">M{e.martingaleStep}</span>}</td>
                        <td className="font-mono">{e.exitDigit}</td>
                        <td><span className={`result-badge ${e.result === 'Win' || e.result === 'V-Win' ? 'win' : e.result === 'Loss' || e.result === 'V-Loss' ? 'loss' : 'pending'}`}>{e.result === 'Pending' ? '...' : e.result === 'V-Win' ? '✓' : e.result === 'V-Loss' ? '✗' : e.result}</span></td>
                        <td className={e.pnl > 0 ? 'text-emerald-400' : e.pnl < 0 ? 'text-red-400' : ''}>{e.result === 'Pending' ? '...' : e.market === 'VH' ? '-' : `${e.pnl > 0 ? '+' : ''}${e.pnl.toFixed(2)}`}</td>
                        <td>{e.market === 'VH' ? '-' : `$${e.balance.toFixed(2)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <TPSLNotificationPopup />
      
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: #0a0c10;
        }

        .pro-scanner-bot {
          min-height: 100vh;
          padding: 24px;
          background: radial-gradient(circle at 20% 30%, #0f1117, #090b0f);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          overflow-y: auto;
          scroll-behavior: smooth;
        }
        
        .pro-scanner-bot::-webkit-scrollbar {
          width: 8px;
        }
        
        .pro-scanner-bot::-webkit-scrollbar-track {
          background: #1a1d24;
          border-radius: 4px;
        }
        
        .pro-scanner-bot::-webkit-scrollbar-thumb {
          background: #3b3f4a;
          border-radius: 4px;
        }
        
        .pro-scanner-bot::-webkit-scrollbar-thumb:hover {
          background: #4a4f5c;
        }
        
        .scanner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(18, 22, 28, 0.8);
          backdrop-filter: blur(12px);
          border-radius: 20px;
          padding: 16px 24px;
          margin-bottom: 24px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .logo-icon {
          padding: 10px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 14px;
          color: white;
        }
        
        .header-left h1 {
          font-size: 20px;
          margin: 0;
          background: linear-gradient(135deg, #a5b4fc 0%, #c084fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 700;
          letter-spacing: -0.3px;
        }
        
        .header-left p {
          font-size: 12px;
          color: #8a8f9e;
          margin: 0;
        }
        
        .header-right {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }
        
        .stat-card {
          background: rgba(18, 22, 28, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.2s ease;
        }
        
        .stat-card:hover {
          border-color: rgba(102, 126, 234, 0.3);
          background: rgba(22, 26, 34, 0.8);
        }
        
        .stat-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-size: 13px;
          font-weight: 500;
          color: #cbd5e1;
        }
        
        .market-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 80px;
          overflow-y: auto;
        }
        
        .market-tags::-webkit-scrollbar {
          width: 4px;
        }
        
        .market-tag {
          font-size: 10px;
          padding: 3px 10px;
          border-radius: 20px;
          background: rgba(45, 50, 60, 0.6);
          color: #9ca3af;
          transition: all 0.2s;
        }
        
        .market-tag.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
        }
        
        .turbo-btn {
          margin-left: auto;
          padding: 4px 12px;
          border-radius: 20px;
          border: none;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          background: #2d323e;
          color: #9ca3af;
          transition: all 0.2s;
        }
        
        .turbo-btn.active {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
        }
        
        .turbo-stats, .live-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          text-align: center;
        }
        
        .turbo-stats div, .live-stats div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .turbo-stats span, .live-stats span {
          font-size: 10px;
          color: #6b7280;
        }
        
        .turbo-stats strong, .live-stats strong {
          font-size: 14px;
          font-weight: 600;
          color: #e5e7eb;
        }
        
        .main-layout {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 24px;
        }
        
        .config-column {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-height: calc(100vh - 200px);
          overflow-y: auto;
          padding-right: 4px;
        }
        
        .config-column::-webkit-scrollbar {
          width: 6px;
        }
        
        .right-column {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-height: calc(100vh - 200px);
          overflow-y: auto;
        }
        
        .right-column::-webkit-scrollbar {
          width: 6px;
        }
        
        .market-card {
          background: rgba(18, 22, 28, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          padding: 18px;
          border-left: 3px solid;
          transition: all 0.2s;
        }
        
        .m1-card { border-left-color: #10b981; }
        .m2-card { border-left-color: #8b5cf6; }
        
        .market-card .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        
        .market-card .card-header h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #f0f0f0;
          margin: 0;
        }
        
        .hook-section {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .hook-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          font-size: 12px;
          color: #cbd5e1;
        }
        
        .hook-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        
        .hook-inputs label {
          font-size: 10px;
          color: #8a8f9e;
          margin-bottom: 4px;
          display: block;
        }
        
        .hook-stats {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
          border: 1px solid rgba(102, 126, 234, 0.2);
          border-radius: 16px;
          padding: 14px;
        }
        
        .hook-stats h3 {
          font-size: 12px;
          margin: 0 0 10px 0;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #e5e7eb;
        }
        
        .hook-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          text-align: center;
        }
        
        .hook-stats-grid span {
          font-size: 10px;
          color: #9ca3af;
          display: block;
        }
        
        .risk-card, .strategy-card, .config-card {
          background: rgba(18, 22, 28, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          padding: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .risk-card h3, .strategy-card h3, .config-card h3 {
          font-size: 14px;
          margin: 0 0 14px 0;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e5e7eb;
        }
        
        .risk-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        
        .risk-grid label, .martingale-grid label {
          font-size: 10px;
          color: #8a8f9e;
          display: block;
          margin-bottom: 4px;
        }
        
        .martingale-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 14px 0;
          color: #cbd5e1;
          font-size: 12px;
        }
        
        .martingale-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        
        .strategy-checkboxes {
          display: flex;
          gap: 20px;
          margin-top: 14px;
          font-size: 12px;
          color: #cbd5e1;
        }
        
        .strategy-checkboxes label {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        
        .strategy-subcard {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 14px;
          background: rgba(0, 0, 0, 0.2);
        }
        
        .m1-strategy { border-left: 2px solid #10b981; }
        .m2-strategy { border-left: 2px solid #ef4444; }
        
        .strategy-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 12px;
          font-weight: 600;
          color: #e5e7eb;
        }
        
        .strategy-mode {
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid #3b3f4a;
          background: #1f232b;
          font-size: 10px;
          cursor: pointer;
          margin-left: 6px;
          color: #9ca3af;
          transition: all 0.2s;
        }
        
        .strategy-mode.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border-color: transparent;
        }
        
        .digit-grid {
          display: grid;
          grid-template-columns: 1fr 0.5fr 1fr;
          gap: 10px;
        }
        
        .pattern-status {
          font-size: 10px;
          margin-top: 8px;
        }
        
        .pattern-status.valid { color: #10b981; }
        .pattern-status.invalid { color: #ef4444; }
        
        .status-message {
          padding: 10px;
          border-radius: 10px;
          text-align: center;
          font-size: 11px;
          font-weight: 600;
          margin-top: 12px;
        }
        
        .status-message.waiting {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        
        .status-message.matched {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        
        .config-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 14px;
        }
        
        .config-buttons button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border-radius: 10px;
          border: 1px solid #3b3f4a;
          background: #1f232b;
          cursor: pointer;
          font-size: 12px;
          color: #e5e7eb;
          transition: all 0.2s;
        }
        
        .config-buttons button:hover:not(:disabled) {
          background: #2d323e;
          border-color: #667eea;
        }
        
        .config-buttons button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .digits-card {
          background: rgba(18, 22, 28, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          padding: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .digits-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }
        
        .digits-header h3 {
          font-size: 14px;
          margin: 0;
          color: #e5e7eb;
        }
        
        .digits-header span {
          font-size: 11px;
          color: #8a8f9e;
        }
        
        .digits-container {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }
        
        .digit-box {
          width: 52px;
          height: 60px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          transition: all 0.2s;
        }
        
        .digit-box.over {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
        }
        
        .digit-box.under {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.3);
          color: #34d399;
        }
        
        .digit-box.last {
          border: 2px solid #667eea;
          box-shadow: 0 0 12px rgba(102, 126, 234, 0.4);
          transform: scale(1.02);
        }
        
        .digit-box .digit {
          font-size: 22px;
          font-weight: 700;
        }
        
        .digit-box .type {
          font-size: 9px;
          opacity: 0.7;
        }
        
        .waiting-text {
          color: #8a8f9e;
          font-size: 12px;
        }
        
        .action-btn {
          width: 100%;
          padding: 18px;
          border-radius: 16px;
          border: none;
          font-size: 16px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          letter-spacing: 0.5px;
        }
        
        .action-btn.start {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
        }
        
        .action-btn.start:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
        }
        
        .action-btn.stop {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          animation: glowPulse 1.5s infinite;
        }
        
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        
        .pulse-dots {
          display: flex;
          gap: 5px;
        }
        
        .pulse-dots .dot {
          width: 6px;
          height: 6px;
          background: white;
          border-radius: 50%;
          animation: bounce 0.6s infinite;
        }
        
        .pulse-dots .dot:nth-child(2) { animation-delay: 0.2s; }
        .pulse-dots .dot:nth-child(3) { animation-delay: 0.4s; }
        
        .live-status {
          background: rgba(18, 22, 28, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          padding: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .live-status h3 {
          font-size: 14px;
          margin: 0 0 14px 0;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e5e7eb;
        }
        
        .status-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        
        .status-grid div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .status-grid span {
          font-size: 10px;
          color: #8a8f9e;
        }
        
        .status-grid strong {
          font-size: 13px;
          font-weight: 600;
          color: #e5e7eb;
        }
        
        .status-banner {
          padding: 10px;
          border-radius: 12px;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        
        .status-banner.hook {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        
        .status-banner.waiting {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        
        .activity-log {
          background: rgba(18, 22, 28, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .log-header {
          padding: 14px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .log-header h3 {
          font-size: 14px;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e5e7eb;
        }
        
        .log-actions {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        
        .log-info {
          font-size: 10px;
          color: #8a8f9e;
        }
        
        .log-actions button {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
          transition: color 0.2s;
        }
        
        .log-actions button:hover {
          color: #ef4444;
        }
        
        .log-table-container {
          max-height: 400px;
          overflow: auto;
        }
        
        .log-table-container::-webkit-scrollbar {
          width: 6px;
        }
        
        .log-table {
          width: 100%;
          font-size: 11px;
          border-collapse: collapse;
        }
        
        .log-table th {
          text-align: left;
          padding: 12px 8px;
          background: rgba(0, 0, 0, 0.3);
          position: sticky;
          top: 0;
          font-weight: 600;
          color: #9ca3af;
          font-size: 10px;
        }
        
        .log-table td {
          padding: 10px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: #d1d5db;
        }
        
        .log-row.m1 { border-left: 2px solid #10b981; }
        .log-row.m2 { border-left: 2px solid #8b5cf6; }
        .log-row.vh { border-left: 2px solid #3b82f6; }
        
        .vh-stake {
          color: #60a5fa;
          font-weight: 600;
        }
        
        .martingale-step {
          color: #fbbf24;
          margin-left: 5px;
          font-weight: bold;
        }
        
        .result-badge {
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 9px;
          font-weight: bold;
          display: inline-block;
        }
        
        .result-badge.win {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }
        
        .result-badge.loss {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }
        
        .result-badge.pending {
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
        }
        
        .empty-log {
          text-align: center;
          padding: 48px;
          color: #6b7280;
        }
        
        .empty-log svg {
          margin-bottom: 12px;
          opacity: 0.5;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.5); }
        }
        
        /* Form element styles */
        input, select, textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #2d323e;
          border-radius: 10px;
          font-size: 12px;
          background: #1a1e26;
          color: #e5e7eb;
          transition: all 0.2s;
        }
        
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }
        
        /* Switch styles */
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .switch .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #2d323e;
          transition: 0.3s;
          border-radius: 24px;
        }
        
        .switch .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }
        
        .switch input:checked + .slider {
          background: linear-gradient(135deg, #667eea, #764ba2);
        }
        
        .switch input:checked + .slider:before {
          transform: translateX(20px);
        }
        
        @media (max-width: 1000px) {
          .main-layout {
            grid-template-columns: 1fr;
          }
          
          .pro-scanner-bot {
            padding: 16px;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
};

// Main TradeUiClone Component - Only Pro Scanner Bot
const TradeUiClone = observer(() => {
  return <ProScannerBot />;
});

export default TradeUiClone;
