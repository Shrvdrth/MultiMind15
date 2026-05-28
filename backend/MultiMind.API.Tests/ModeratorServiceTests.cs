using MultiMind.API.Services;
using Xunit;

namespace MultiMind.API.Tests;

/// <summary>
/// Tests for ModeratorService.ParseModeratorJson — the JSON parsing and markdown-stripping
/// logic that processes raw AI output into a structured ModeratorResult.
/// The actual OpenAI call is not exercised (requires a live API key).
/// </summary>
public class ModeratorServiceTests
{
    // ── Helpers ─────────────────────────────────────────────────────────────

    private static string ValidJson(
        string recommendation = "Proceed with caution.",
        int confidence = 72,
        string dissent = "Engineer flagged scalability concerns.",
        string synthesis = "Agents broadly agreed but differed on timeline.") =>
        $$"""
        {
          "recommendation": "{{recommendation}}",
          "confidenceScore": {{confidence}},
          "keyDissentingViewpoints": "{{dissent}}",
          "fullSynthesis": "{{synthesis}}"
        }
        """;

    // ── Happy path ───────────────────────────────────────────────────────────

    [Fact]
    public void ParseModeratorJson_CleanJson_ReturnsCorrectResult()
    {
        var result = ModeratorService.ParseModeratorJson(ValidJson());

        Assert.Equal("Proceed with caution.", result.Recommendation);
        Assert.Equal(72, result.ConfidenceScore);
        Assert.Equal("Engineer flagged scalability concerns.", result.KeyDissentingViewpoints);
        Assert.Equal("Agents broadly agreed but differed on timeline.", result.FullSynthesis);
    }

    [Fact]
    public void ParseModeratorJson_JsonInMarkdownFenceWithLanguageTag_StripsAndParses()
    {
        var raw = "```json\n" + ValidJson() + "\n```";

        var result = ModeratorService.ParseModeratorJson(raw);

        Assert.Equal("Proceed with caution.", result.Recommendation);
        Assert.Equal(72, result.ConfidenceScore);
    }

    [Fact]
    public void ParseModeratorJson_JsonInMarkdownFenceNoLanguageTag_StripsAndParses()
    {
        var raw = "```\n" + ValidJson() + "\n```";

        var result = ModeratorService.ParseModeratorJson(raw);

        Assert.Equal("Proceed with caution.", result.Recommendation);
        Assert.Equal(72, result.ConfidenceScore);
    }

    [Fact]
    public void ParseModeratorJson_LeadingAndTrailingWhitespace_Handled()
    {
        var raw = "   \n\n" + ValidJson() + "\n\n  ";

        var result = ModeratorService.ParseModeratorJson(raw);

        Assert.Equal(72, result.ConfidenceScore);
    }

    [Fact]
    public void ParseModeratorJson_CamelCaseFieldNames_CaseInsensitiveDeserialize()
    {
        var json = """
            {
              "recommendation": "Go ahead.",
              "confidenceScore": 85,
              "keyDissentingViewpoints": "None significant.",
              "fullSynthesis": "All agents aligned."
            }
            """;

        var result = ModeratorService.ParseModeratorJson(json);

        Assert.Equal("Go ahead.", result.Recommendation);
        Assert.Equal(85, result.ConfidenceScore);
    }

    [Fact]
    public void ParseModeratorJson_PascalCaseFieldNames_CaseInsensitiveDeserialize()
    {
        var json = """
            {
              "Recommendation": "Stop the project.",
              "ConfidenceScore": 30,
              "KeyDissentingViewpoints": "Strategist disagreed.",
              "FullSynthesis": "Major disagreements found."
            }
            """;

        var result = ModeratorService.ParseModeratorJson(json);

        Assert.Equal("Stop the project.", result.Recommendation);
        Assert.Equal(30, result.ConfidenceScore);
    }

    // ── ConfidenceScore boundary values ─────────────────────────────────────

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(40)]
    [InlineData(60)]
    [InlineData(80)]
    [InlineData(99)]
    [InlineData(100)]
    public void ParseModeratorJson_ConfidenceScore_AcceptsValidRange(int score)
    {
        var result = ModeratorService.ParseModeratorJson(ValidJson(confidence: score));

        Assert.Equal(score, result.ConfidenceScore);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    [InlineData(999)]
    public void ParseModeratorJson_ConfidenceScore_OutOfRange_PassesThroughWithoutClamping(int score)
    {
        // Service does not clamp — it trusts the AI; this documents current behaviour.
        var result = ModeratorService.ParseModeratorJson(ValidJson(confidence: score));

        Assert.Equal(score, result.ConfidenceScore);
    }

    // ── Markdown fence edge cases ────────────────────────────────────────────

    [Fact]
    public void ParseModeratorJson_MarkdownFenceWithWindowsLineEndings_StripsCorrectly()
    {
        var raw = "```json\r\n" + ValidJson().Replace("\n", "\r\n") + "\r\n```";

        // Should not throw — CRLF newline after the fence opening still works
        // (IndexOf('\n') finds the LF of \r\n)
        var result = ModeratorService.ParseModeratorJson(raw);

        Assert.Equal(72, result.ConfidenceScore);
    }

    [Fact]
    public void ParseModeratorJson_FenceWithNoNewline_ReturnsRemainingStringAsJson()
    {
        // Edge: "```" with nothing after — should throw because what remains isn't valid JSON
        var raw = "```";

        Assert.Throws<System.Text.Json.JsonException>(() =>
            ModeratorService.ParseModeratorJson(raw));
    }

    // ── Extra / missing fields ───────────────────────────────────────────────

    [Fact]
    public void ParseModeratorJson_ExtraUnknownFields_AreIgnored()
    {
        var json = """
            {
              "recommendation": "Proceed.",
              "confidenceScore": 78,
              "keyDissentingViewpoints": "Minor.",
              "fullSynthesis": "Looks good.",
              "extraField": "should be ignored",
              "anotherExtra": 42
            }
            """;

        var result = ModeratorService.ParseModeratorJson(json);

        Assert.Equal("Proceed.", result.Recommendation);
        Assert.Equal(78, result.ConfidenceScore);
    }

    [Fact]
    public void ParseModeratorJson_MissingOptionalFields_DefaultsToNull()
    {
        // If AI omits some fields, the deserializer sets them to null/default
        var json = """{ "confidenceScore": 55 }""";

        var result = ModeratorService.ParseModeratorJson(json);

        Assert.Equal(55, result.ConfidenceScore);
        Assert.Null(result.Recommendation);
        Assert.Null(result.KeyDissentingViewpoints);
        Assert.Null(result.FullSynthesis);
    }

    // ── Malformed / invalid input ────────────────────────────────────────────

    [Fact]
    public void ParseModeratorJson_MalformedJson_ThrowsJsonException()
    {
        Assert.Throws<System.Text.Json.JsonException>(() =>
            ModeratorService.ParseModeratorJson("{ recommendation: missing quotes }"));
    }

    [Fact]
    public void ParseModeratorJson_EmptyString_ThrowsJsonException()
    {
        Assert.Throws<System.Text.Json.JsonException>(() =>
            ModeratorService.ParseModeratorJson(""));
    }

    [Fact]
    public void ParseModeratorJson_NullInput_ThrowsJsonException()
    {
        Assert.Throws<System.Text.Json.JsonException>(() =>
            ModeratorService.ParseModeratorJson(null!));
    }

    [Fact]
    public void ParseModeratorJson_PlainTextNotJson_ThrowsJsonException()
    {
        Assert.Throws<System.Text.Json.JsonException>(() =>
            ModeratorService.ParseModeratorJson("This is just a plain text response."));
    }

    [Fact]
    public void ParseModeratorJson_JsonArrayInsteadOfObject_ThrowsInvalidOperationOrJsonException()
    {
        // If AI returns an array instead of object, should fail predictably
        var ex = Record.Exception(() =>
            ModeratorService.ParseModeratorJson("[1, 2, 3]"));

        Assert.NotNull(ex);
        Assert.True(ex is InvalidOperationException or System.Text.Json.JsonException);
    }

    [Fact]
    public void ParseModeratorJson_ConfidenceScoreAsString_ThrowsJsonException()
    {
        // If AI wraps the number in quotes, deserialization should fail on the int field
        var json = """
            {
              "recommendation": "Proceed.",
              "confidenceScore": "seventy-two",
              "keyDissentingViewpoints": "None.",
              "fullSynthesis": "All good."
            }
            """;

        Assert.Throws<System.Text.Json.JsonException>(() =>
            ModeratorService.ParseModeratorJson(json));
    }

    // ── Real-world AI response shapes ────────────────────────────────────────

    [Fact]
    public void ParseModeratorJson_MultilineRecommendation_ParsedCorrectly()
    {
        var json = """
            {
              "recommendation": "Adopt the microservices architecture. Begin with the authentication service, then extract the payment module in Q3.",
              "confidenceScore": 68,
              "keyDissentingViewpoints": "The Engineer raised concerns about operational complexity increasing incident response time by an estimated 40%.",
              "fullSynthesis": "The Strategist and Risk Analyst broadly agreed that the benefits outweigh the risks at current scale, while the Engineer pushed back on the timeline feasibility."
            }
            """;

        var result = ModeratorService.ParseModeratorJson(json);

        Assert.Contains("microservices", result.Recommendation);
        Assert.Equal(68, result.ConfidenceScore);
        Assert.Contains("operational complexity", result.KeyDissentingViewpoints);
    }

    [Fact]
    public void ParseModeratorJson_JsonWithEscapedQuotesInStrings_ParsedCorrectly()
    {
        var json = """
            {
              "recommendation": "Use the \"build\" option over \"buy\".",
              "confidenceScore": 91,
              "keyDissentingViewpoints": "No significant dissent.",
              "fullSynthesis": "Strong consensus across agents."
            }
            """;

        var result = ModeratorService.ParseModeratorJson(json);

        Assert.Contains("build", result.Recommendation);
        Assert.Equal(91, result.ConfidenceScore);
    }
}
