'use client';

import { useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import { useFilterPresetsStore } from '@/stores/filter-presets-store';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'date_range'
  | 'is_null'
  | 'is_not_null';

export type FilterGroupLogic = 'AND' | 'OR';

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  valueTo?: string; // used for date_range: end of range
}

export interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options?: Array<{ label: string; value: string }>;
}

export interface AdvancedFilterBuilderProps {
  fields: FilterField[];
  conditions: FilterCondition[];
  onChange: (conditions: FilterCondition[]) => void;
  /** Logic applied between top-level conditions. Default AND. */
  logic?: FilterGroupLogic;
  onLogicChange?: (logic: FilterGroupLogic) => void;
  /** Scopes saved presets to a page — omit to disable preset functionality. */
  pageKey?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Operator metadata
// ---------------------------------------------------------------------------

interface OperatorConfig {
  label: string;
  needsValue: boolean;
  needsSecondValue?: boolean;
}

const OPERATORS: Record<FilterOperator, OperatorConfig> = {
  equals: { label: 'equals', needsValue: true },
  not_equals: { label: 'does not equal', needsValue: true },
  contains: { label: 'contains', needsValue: true },
  not_contains: { label: 'does not contain', needsValue: true },
  starts_with: { label: 'starts with', needsValue: true },
  ends_with: { label: 'ends with', needsValue: true },
  greater_than: { label: 'greater than', needsValue: true },
  less_than: { label: 'less than', needsValue: true },
  greater_than_or_equal: { label: '>= (greater or equal)', needsValue: true },
  less_than_or_equal: { label: '<= (less or equal)', needsValue: true },
  date_range: { label: 'is between', needsValue: true, needsSecondValue: true },
  is_null: { label: 'is empty', needsValue: false },
  is_not_null: { label: 'is not empty', needsValue: false },
};

function getOperatorsForType(type: FilterField['type']): FilterOperator[] {
  switch (type) {
    case 'text':
      return [
        'equals',
        'not_equals',
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
        'is_null',
        'is_not_null',
      ];
    case 'number':
      return [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'greater_than_or_equal',
        'less_than_or_equal',
        'is_null',
        'is_not_null',
      ];
    case 'date':
      return [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'date_range',
        'is_null',
        'is_not_null',
      ];
    case 'select':
      return ['equals', 'not_equals', 'is_null', 'is_not_null'];
    case 'boolean':
      return ['equals', 'is_null', 'is_not_null'];
    default:
      return ['equals', 'contains', 'is_null', 'is_not_null'];
  }
}

function defaultOperatorForType(type: FilterField['type']): FilterOperator {
  switch (type) {
    case 'text':
      return 'contains';
    default:
      return 'equals';
  }
}

function makeEmptyCondition(field: FilterField): FilterCondition {
  return {
    id: nanoid(8),
    field: field.key,
    operator: defaultOperatorForType(field.type),
    value: '',
  };
}

// ---------------------------------------------------------------------------
// Preset serialization helpers
// ---------------------------------------------------------------------------

function conditionsToRecord(conditions: FilterCondition[]): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const cond of conditions) {
    const parts = [cond.operator, cond.value, ...(cond.valueTo ? [cond.valueTo] : [])];
    if (!record[cond.field]) record[cond.field] = [];
    record[cond.field].push(parts.join('\x1f'));
  }
  return record;
}

function recordToConditions(
  record: Record<string, string[]>,
  fields: FilterField[]
): FilterCondition[] {
  const result: FilterCondition[] = [];
  for (const [fieldKey, values] of Object.entries(record)) {
    for (const serialized of values) {
      const [operator = 'equals', value = '', valueTo] = serialized.split('\x1f');
      // Validate operator exists
      if (!(operator in OPERATORS)) continue;
      result.push({
        id: nanoid(8),
        field: fieldKey,
        operator: operator as FilterOperator,
        value,
        ...(valueTo ? { valueTo } : {}),
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdvancedFilterBuilder({
  fields,
  conditions,
  onChange,
  logic = 'AND',
  onLogicChange,
  pageKey,
  className,
}: AdvancedFilterBuilderProps) {
  const [showPresetSaver, setShowPresetSaver] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);

  const presetsStore = useFilterPresetsStore();
  const savedPresets = pageKey ? presetsStore.getPresets(pageKey) : [];

  // ---- mutation helpers ----

  const addCondition = useCallback(() => {
    if (fields.length === 0) return;
    onChange([...conditions, makeEmptyCondition(fields[0])]);
  }, [fields, conditions, onChange]);

  const removeCondition = useCallback(
    (id: string) => onChange(conditions.filter((c) => c.id !== id)),
    [conditions, onChange]
  );

  const updateCondition = useCallback(
    (id: string, patch: Partial<FilterCondition>) => {
      onChange(
        conditions.map((c) => {
          if (c.id !== id) return c;
          const next = { ...c, ...patch };

          // When operator changes: clear values when not needed
          if (patch.operator !== undefined) {
            const cfg = OPERATORS[patch.operator];
            if (!cfg.needsValue) {
              next.value = '';
              next.valueTo = undefined;
            }
            if (!cfg.needsSecondValue) {
              next.valueTo = undefined;
            }
          }

          // When field changes: reset operator + value
          if (patch.field !== undefined) {
            const newField = fields.find((f) => f.key === patch.field);
            if (newField) {
              next.operator = defaultOperatorForType(newField.type);
              next.value = '';
              next.valueTo = undefined;
            }
          }

          return next;
        })
      );
    },
    [conditions, onChange, fields]
  );

  const clearAll = useCallback(() => onChange([]), [onChange]);

  // ---- preset actions ----

  const savePreset = () => {
    if (!pageKey || !presetName.trim() || conditions.length === 0) return;
    presetsStore.addPreset(pageKey, {
      name: presetName.trim(),
      filters: conditionsToRecord(conditions),
    });
    setPresetName('');
    setShowPresetSaver(false);
  };

  const loadPreset = (presetId: string) => {
    const preset = savedPresets.find((p) => p.id === presetId);
    if (!preset) return;
    onChange(recordToConditions(preset.filters, fields));
    setShowPresetsMenu(false);
  };

  const deletePreset = (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    if (pageKey) presetsStore.deletePreset(pageKey, presetId);
  };

  return (
    <div className={cn('bg-surface border border-border rounded-xl overflow-hidden', className)}>
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-hover/50 flex-wrap">
        <div className="flex items-center gap-2.5">
          <FilterIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
          <span className="text-sm font-medium text-text-primary">Advanced Filters</span>
          {conditions.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full font-medium">
              {conditions.length} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* AND / OR logic toggle — only show when > 1 conditions */}
          {conditions.length > 1 && (
            <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
              <button
                className={cn(
                  'px-2.5 py-1.5 transition-colors font-medium',
                  logic === 'AND'
                    ? 'bg-accent text-text-inverse'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                )}
                onClick={() => onLogicChange?.('AND')}
                disabled={!onLogicChange}
                title="Match all conditions"
              >
                AND
              </button>
              <button
                className={cn(
                  'px-2.5 py-1.5 transition-colors font-medium border-l border-border',
                  logic === 'OR'
                    ? 'bg-accent text-text-inverse'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                )}
                onClick={() => onLogicChange?.('OR')}
                disabled={!onLogicChange}
                title="Match any condition"
              >
                OR
              </button>
            </div>
          )}

          {/* Presets dropdown */}
          {pageKey && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowPresetsMenu((v) => !v);
                  setShowPresetSaver(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <BookmarkIcon className="w-3.5 h-3.5" />
                Presets
                {savedPresets.length > 0 && (
                  <span className="ml-0.5 text-[10px] px-1.5 py-0.5 bg-surface-hover rounded-full">
                    {savedPresets.length}
                  </span>
                )}
              </button>

              {showPresetsMenu && (
                <>
                  {/* Click-outside closer */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPresetsMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-20 w-60 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
                    {savedPresets.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-text-muted">
                        No saved presets yet.
                      </div>
                    ) : (
                      <ul className="divide-y divide-border max-h-52 overflow-y-auto">
                        {savedPresets.map((preset) => (
                          <li
                            key={preset.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover transition-colors group cursor-pointer"
                            onClick={() => loadPreset(preset.id)}
                          >
                            <span className="flex-1 text-sm text-text-primary truncate">
                              {preset.name}
                            </span>
                            <button
                              onClick={(e) => deletePreset(e, preset.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-red-500 rounded transition-all"
                              aria-label="Delete preset"
                            >
                              <XSmallIcon className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Save current as preset */}
                    {conditions.length > 0 && (
                      <div className="border-t border-border p-3">
                        {showPresetSaver ? (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={presetName}
                              onChange={(e) => setPresetName(e.target.value)}
                              placeholder="Preset name..."
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePreset();
                                if (e.key === 'Escape') setShowPresetSaver(false);
                              }}
                              className="flex-1 px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                            />
                            <button
                              onClick={savePreset}
                              disabled={!presetName.trim()}
                              className="px-2 py-1 text-xs bg-accent text-text-inverse rounded disabled:opacity-40 hover:bg-accent/90 transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowPresetSaver(true)}
                            className="w-full text-xs text-accent hover:text-accent/80 transition-colors text-left"
                          >
                            + Save current filters as preset
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Clear all */}
          {conditions.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-muted hover:text-red-500 border border-border rounded-lg hover:bg-red-500/5 hover:border-red-500/20 transition-colors"
            >
              <XSmallIcon className="w-3.5 h-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* ---- Conditions list ---- */}
      <div className="divide-y divide-border">
        {conditions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            No conditions set. Click &ldquo;Add condition&rdquo; below to start filtering.
          </div>
        ) : (
          conditions.map((condition, index) => (
            <ConditionRow
              key={condition.id}
              condition={condition}
              fields={fields}
              index={index}
              logic={logic}
              onUpdate={(patch) => updateCondition(condition.id, patch)}
              onRemove={() => removeCondition(condition.id)}
            />
          ))
        )}
      </div>

      {/* ---- Add condition footer ---- */}
      <div className="px-4 py-3 border-t border-border bg-surface-hover/30 flex items-center justify-between">
        <button
          onClick={addCondition}
          disabled={fields.length === 0}
          className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PlusIcon className="w-4 h-4" />
          Add condition
        </button>
        {conditions.length > 0 && (
          <span className="text-xs text-text-muted">
            {conditions.length} condition{conditions.length !== 1 ? 's' : ''},{' '}
            match <strong className="text-text-primary">{logic}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Condition row
// ---------------------------------------------------------------------------

interface ConditionRowProps {
  condition: FilterCondition;
  fields: FilterField[];
  index: number;
  logic: FilterGroupLogic;
  onUpdate: (patch: Partial<FilterCondition>) => void;
  onRemove: () => void;
}

function ConditionRow({
  condition,
  fields,
  index,
  logic,
  onUpdate,
  onRemove,
}: ConditionRowProps) {
  const selectedField = fields.find((f) => f.key === condition.field) ?? fields[0];
  const availableOperators = selectedField ? getOperatorsForType(selectedField.type) : [];
  const operatorConfig: OperatorConfig | undefined = OPERATORS[condition.operator];

  return (
    <div className="flex items-start gap-2 px-4 py-3 group flex-wrap sm:flex-nowrap">
      {/* Logic label */}
      <div className="w-12 flex-shrink-0 flex items-center justify-center pt-2.5">
        {index === 0 ? (
          <span className="text-xs text-text-muted">where</span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded font-semibold">
            {logic}
          </span>
        )}
      </div>

      {/* Field */}
      <select
        value={condition.field}
        onChange={(e) => onUpdate({ field: e.target.value })}
        aria-label="Filter field"
        className="flex-shrink-0 w-36 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors"
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value as FilterOperator })}
        aria-label="Filter operator"
        className="flex-shrink-0 w-44 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors"
      >
        {availableOperators.map((op) => (
          <option key={op} value={op}>
            {OPERATORS[op].label}
          </option>
        ))}
      </select>

      {/* Value(s) */}
      {operatorConfig?.needsValue && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ConditionValueInput
            field={selectedField}
            value={condition.value}
            onChange={(v) => onUpdate({ value: v })}
          />
          {operatorConfig.needsSecondValue && (
            <>
              <span className="text-xs text-text-muted flex-shrink-0">to</span>
              <ConditionValueInput
                field={selectedField}
                value={condition.valueTo ?? ''}
                onChange={(v) => onUpdate({ valueTo: v })}
              />
            </>
          )}
        </div>
      )}

      {/* Spacer when no value needed */}
      {!operatorConfig?.needsValue && <div className="flex-1" />}

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1.5 mt-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
        aria-label="Remove condition"
      >
        <XSmallIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value input — adapts to field type
// ---------------------------------------------------------------------------

interface ConditionValueInputProps {
  field: FilterField | undefined;
  value: string;
  onChange: (value: string) => void;
}

function ConditionValueInput({ field, value, onChange }: ConditionValueInputProps) {
  const inputClass =
    'w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors';

  if (field?.type === 'select' && field.options) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter value"
        className={inputClass}
      >
        <option value="">Select...</option>
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field?.type === 'boolean') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter value"
        className={inputClass}
      >
        <option value="">Select...</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }

  if (field?.type === 'date') {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter value"
        className={inputClass}
      />
    );
  }

  if (field?.type === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-label="Filter value"
        className={inputClass}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value..."
      aria-label="Filter value"
      className={inputClass}
    />
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function XSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}
