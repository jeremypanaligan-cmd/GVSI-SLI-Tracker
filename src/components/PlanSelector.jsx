/**
 * PlanSelector — Tab bar for switching between service plans (FIBERX / BIDA / SME).
 * Renders compact pills with plan-specific accent colors.
 */
import { PLANS, PLAN_ORDER } from '../config/plans'

export default function PlanSelector({ activePlan, onPlanChange, isSyncing }) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700/40">
      {PLAN_ORDER.map((planId) => {
        const plan = PLANS[planId]
        const isActive = activePlan === planId
        return (
          <button
            key={planId}
            onClick={() => !isSyncing && onPlanChange(planId)}
            disabled={isSyncing}
            className={`
              relative px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all duration-200
              ${isActive
                ? `${plan.accentClasses.bg} text-white shadow-md shadow-${plan.color}-600/20`
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/60'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            title={plan.fullName}
          >
            {plan.name}
            {isActive && (
              <span className={`absolute inset-0 rounded-md ring-1 ring-white/20 dark:ring-white/10`} />
            )}
          </button>
        )
      })}
    </div>
  )
}
