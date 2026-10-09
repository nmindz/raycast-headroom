import { List } from "@raycast/api";
import { PERIOD_TITLES, USAGE_PERIODS, type PeriodId } from "../lib/periods";

interface PeriodDropdownProps<S extends string> {
  value: S;
  onChange: (scope: S) => void;
  /** Non-period scopes appended after the periods (e.g. lifetime). */
  extra?: Array<{ value: Exclude<S, PeriodId>; title: string }>;
}

/** Every period of USAGE_PERIODS, plus `extra` scopes; `S` is the period id or a union widening it. */
export function PeriodDropdown<S extends string>({ value, onChange, extra = [] }: PeriodDropdownProps<S>) {
  return (
    <List.Dropdown tooltip="Period" value={value} onChange={(next) => onChange(next as S)}>
      <List.Dropdown.Section>
        {USAGE_PERIODS.map((period) => (
          <List.Dropdown.Item key={period} title={PERIOD_TITLES[period]} value={period} />
        ))}
      </List.Dropdown.Section>
      {extra.length > 0 && (
        <List.Dropdown.Section>
          {extra.map((option) => (
            <List.Dropdown.Item key={option.value} title={option.title} value={option.value} />
          ))}
        </List.Dropdown.Section>
      )}
    </List.Dropdown>
  );
}
