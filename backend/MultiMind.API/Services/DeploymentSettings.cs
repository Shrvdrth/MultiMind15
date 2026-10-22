using Npgsql;

namespace MultiMind.API.Services;

/// <summary>
/// Small helpers for reading hosting settings (CORS origins, database URL).
/// </summary>
public static class DeploymentSettings
{
    /// <summary>
    /// Splits a comma-separated list of frontend URLs into CORS origins.
    /// Trailing slashes are removed because browsers send origins without them.
    /// </summary>
    public static string[] ParseOrigins(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return [];

        return value
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(o => o.TrimEnd('/'))
            .Where(o => o.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
