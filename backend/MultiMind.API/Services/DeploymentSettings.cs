using Npgsql;

namespace MultiMind.API.Services;

/// <summary>
/// Small helpers for reading hosting settings (CORS origins, database URL).
/// </summary>
public static class DeploymentSettings
{
    /// <summary>
    /// OpenRouter's free router: it only picks free models, so it never spends credits
    /// and keeps working when an individual free model is retired.
    /// </summary>
    public const string DefaultFreeModel = "openrouter/free";

    /// <summary>True for OpenRouter models that cost nothing to call.</summary>
    public static bool IsFreeModel(string? model) =>
        !string.IsNullOrWhiteSpace(model) &&
        (model.EndsWith(":free", StringComparison.OrdinalIgnoreCase) ||
         string.Equals(model, DefaultFreeModel, StringComparison.OrdinalIgnoreCase));

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

    /// <summary>
    /// Returns an Npgsql connection string. Accepts either the normal
    /// "Host=...;Database=..." format or a URL like the one Neon gives you:
    /// postgresql://user:password@host/dbname?sslmode=require
    /// Falls back to the DATABASE_URL environment variable when the setting is empty.
    /// </summary>
    public static string? ResolveConnectionString(string? configured, string? databaseUrl)
    {
        var value = string.IsNullOrWhiteSpace(configured) ? databaseUrl : configured;
        if (string.IsNullOrWhiteSpace(value)) return null;

        value = value.Trim();
        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
            return value;

        var uri = new Uri(value);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
        };

        var userInfo = uri.UserInfo.Split(':', 2);
        if (userInfo[0].Length > 0) builder.Username = Uri.UnescapeDataString(userInfo[0]);
        if (userInfo.Length > 1) builder.Password = Uri.UnescapeDataString(userInfo[1]);

        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            var key = Uri.UnescapeDataString(kv[0]).ToLowerInvariant();
            var val = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]).Replace("-", "") : "";

            if (key == "sslmode" && Enum.TryParse<SslMode>(val, true, out var ssl))
                builder.SslMode = ssl;
            else if (key == "channel_binding" && Enum.TryParse<ChannelBinding>(val, true, out var cb))
                builder.ChannelBinding = cb;
            // Other URL options are ignored.
        }

        return builder.ConnectionString;
    }
}
