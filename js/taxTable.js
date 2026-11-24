// Capital-gains tax rate per country (flat-rate approximation; see README).
// v8.11: Germany 18.5% = 26.375% on 70% of the gain (equity-fund partial exemption).
export const COUNTRY_TAX = { FR:30, PT:28, ES:26, DE:18.5, IT:26, NL:32, BE:0, LU:0, AT:28, IE:33, GR:15,
                      CY:0, MT:0, HR:10, HU:15, RO:10, BG:10, PL:19, SI:25, EE:20, LV:20, LT:15,
                      SK:19, SE:30, DK:27, FI:30 };
