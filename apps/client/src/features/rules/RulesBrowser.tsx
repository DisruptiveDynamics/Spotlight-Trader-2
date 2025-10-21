import type { Rule, EvaluatedRule } from "@shared/types/rules";
import { useState, useEffect } from "react";

export function RulesBrowser() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [dryRunResults, setDryRunResults] = useState<EvaluatedRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const response = await fetch("/api/rules?userId=demo-user");
      const data = await response.json();
      setRules(data.rules || []);
    } catch (error) {
      console.error("Failed to fetch rules:", error);
    }
  };

  const runDryRun = async (rule: Rule) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/rules/dryrun?id=${rule.id}&symbol=SPY&userId=demo-user`);
      const data = await response.json();
      setDryRunResults(data.evaluations || []);
      setSelectedRule(rule);
    } catch (error) {
      console.error("Failed to run dry run:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full gap-4">
      <div className="w-1/3 border-r border-gray-200 pr-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Trading Rules</h2>
          <button className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
            + New Rule
          </button>
        </div>

        {rules.length === 0 ? (
          <p className="text-gray-500 text-sm">No rules configured</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-3 border rounded cursor-pointer transition-colors ${
                  selectedRule?.id === rule.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => setSelectedRule(rule)}
              >
                <div className="font-medium">{rule.name}</div>
                <div className="text-xs text-gray-500 mt-1">{rule.expression}</div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runDryRun(rule);
                    }}
                    className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Test
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1">
        {!selectedRule ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a rule to view details
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold mb-2">{selectedRule.name}</h3>
            <p className="text-sm text-gray-600 mb-4">{selectedRule.description}</p>

            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-1">Expression</div>
              <code className="block p-2 bg-gray-100 rounded text-sm">
                {selectedRule.expression}
              </code>
            </div>

            {dryRunResults.length > 0 && (
              <div>
                <h4 className="text-md font-medium mb-2">
                  Dry Run Results ({dryRunResults.length} bars)
                </h4>
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {dryRunResults.map((result, idx) => (
                    <div
                      key={idx}
                      className={`p-2 text-sm rounded ${
                        result.passed
                          ? "bg-green-50 border border-green-200"
                          : "bg-gray-50 border border-gray-200"
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className="font-mono">Seq {result.barSeq}</span>
                        <span className={result.passed ? "text-green-600" : "text-gray-400"}>
                          {result.passed ? "✓ PASS" : "✗ FAIL"}
                        </span>
                      </div>
                      {result.passed && (
                        <div className="mt-1 text-xs text-gray-600">
                          Signal: {result.signal?.toUpperCase()} | Confidence:{" "}
                          {(result.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Running dry run...</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
