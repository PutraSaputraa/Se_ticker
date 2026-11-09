// Universe pemindaian breakout per bursa.
// Mengikuti konvensi selector 'Bursa' di App.jsx — kunci 'auto' memetakan ke
// universe default yang paling likuid (Indonesia LQ45).
//
// Tiap entri: { name, currency, symbols[] }.
// Sufiks Yahoo sudah disertakan pada simbol (mis. '.JK', '.T', '.HK').

export const universes = {
  auto: {
    name: 'LQ45',
    label: 'Otomatis',
    currency: 'IDR',
    symbols: [
      'ACES.JK', 'ADRO.JK', 'AMRT.JK', 'ANTM.JK', 'ASII.JK',
      'BBCA.JK', 'BBNI.JK', 'BBRI.JK', 'BMRI.JK', 'BRIS.JK',
      'BTPS.JK', 'BYAN.JK', 'CPIN.JK', 'CTRA.JK', 'GOTO.JK',
      'GGRM.JK', 'ICBP.JK', 'INCO.JK', 'INDF.JK', 'INDY.JK',
      'INKP.JK', 'INTP.JK', 'ITMG.JK', 'JPFA.JK', 'KLBF.JK',
      'MAPI.JK', 'MBMA.JK', 'MDKA.JK', 'MEDC.JK', 'MIKA.JK',
      'MYOR.JK', 'PGAS.JK', 'PNLF.JK', 'PTBA.JK', 'PWON.JK',
      'SCMA.JK', 'SIDO.JK', 'SMGR.JK', 'SMRA.JK', 'SRTG.JK',
      'TINS.JK', 'TKIM.JK', 'TLKM.JK', 'TOWR.JK', 'UNTR.JK',
    ],
  },
  us: {
    name: 'US Top 30',
    label: 'AS',
    currency: 'USD',
    symbols: [
      'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
      'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
      'CRM', 'ADBE', 'INTC', 'QCOM', 'TXN',
      'MU', 'PLTR', 'SMCI', 'COIN', 'UBER',
      'SHOP', 'SQ', 'SNOW', 'DDOG', 'NET',
      'CRWD', 'PANW', 'ARM', 'MRVL', 'ON',
    ],
  },
  jp: {
    name: 'Jepang Top 20',
    label: 'Jepang',
    currency: 'JPY',
    symbols: [
      '7203.T', '8306.T', '9984.T', '6861.T', '9433.T',
      '6501.T', '6758.T', '7974.T', '8035.T', '4063.T',
      '6902.T', '6954.T', '7741.T', '8058.T', '8316.T',
      '8411.T', '8766.T', '8801.T', '9020.T', '9502.T',
    ],
  },
  hk: {
    name: 'Hong Kong Top 20',
    label: 'Hong Kong',
    currency: 'HKD',
    symbols: [
      '0700.HK', '9988.HK', '0939.HK', '1299.HK', '0005.HK',
      '1398.HK', '2318.HK', '0941.HK', '3690.HK', '9618.HK',
      '1810.HK', '9888.HK', '1211.HK', '2269.HK', '2020.HK',
      '0001.HK', '0016.HK', '0388.HK', '0883.HK', '2628.HK',
    ],
  },
  ks: {
    name: 'KOSPI Top 15',
    label: 'Korea Selatan (KOSPI)',
    currency: 'KRW',
    symbols: [
      '005930.KS', '000660.KS', '005380.KS', '035420.KS', '051910.KS',
      '006400.KS', '035720.KS', '068270.KS', '207940.KS', '005490.KS',
      '028260.KS', '012330.KS', '066570.KS', '096770.KS', '003550.KS',
    ],
  },
  kq: {
    name: 'KOSDAQ Top 10',
    label: 'Korea Selatan (KOSDAQ)',
    currency: 'KRW',
    symbols: [
      '247540.KQ', '086520.KQ', '091990.KQ', '263750.KQ', '293490.KQ',
      '196170.KQ', '357780.KQ', '095340.KQ', '112040.KQ', '145020.KQ',
    ],
  },
  ss: {
    name: 'Shanghai Top 10',
    label: 'China (Shanghai)',
    currency: 'CNY',
    symbols: [
      '600519.SS', '601318.SS', '600036.SS', '601166.SS', '600276.SS',
      '600030.SS', '601888.SS', '600585.SS', '601012.SS', '600900.SS',
    ],
  },
  sz: {
    name: 'Shenzhen Top 10',
    label: 'China (Shenzhen)',
    currency: 'CNY',
    symbols: [
      '300750.SZ', '000858.SZ', '002594.SZ', '000333.SZ', '002415.SZ',
      '300059.SZ', '002475.SZ', '000651.SZ', '300760.SZ', '002352.SZ',
    ],
  },
};

export function getUniverse(region) {
  return universes[region] ?? universes.auto;
}

export const universeRegions = Object.keys(universes);
