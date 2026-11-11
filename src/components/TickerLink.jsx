import { Link } from 'react-router-dom';

const tickerPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/i;

export default function TickerLink({ symbol }) {
  if (typeof symbol !== 'string' || symbol.length > 32 || !tickerPattern.test(symbol)) {
    return <span className="research-ticker">{symbol}</span>;
  }

  return <Link className="research-ticker" to={`/stock/${encodeURIComponent(symbol)}`}>{symbol}</Link>;
}
