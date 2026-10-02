using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using Nd30.LegalValidator.Processing;

if (args.Length != 1) throw new ArgumentException("Pass the node-docx oracle-artifacts directory.");
var artifacts = Path.GetFullPath(args[0]);
var inputs = Path.Combine(artifacts, "inputs");
var outputs = Path.Combine(artifacts, "outputs");
var resultsPath = Path.Combine(artifacts, "node-results.json");
var cases = JsonSerializer.Deserialize<List<NodeCase>>(await File.ReadAllTextAsync(resultsPath), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
    ?? throw new InvalidDataException("Node oracle result manifest is empty.");
var processor = new DocumentProcessorService();
var validator = new OpenXmlValidator();
var checks = 0;
var crossOracleDisagreements = new List<string>();

foreach (var testCase in cases)
{
    var inputPath = Path.Combine(inputs, testCase.FileName);
    var source = await File.ReadAllBytesAsync(inputPath);
    Require(Hash(source) == testCase.SourceSha256, $"Source SHA mismatch before .NET inspection: {testCase.FileName}");
    ValidateOpenXml(source, validator, $"source {testCase.FileName}");
    checks++;
    byte[]? output = null;
    string? outputPath = null;
    if (testCase.OutputFile is not null)
    {
        outputPath = Path.Combine(outputs, testCase.OutputFile);
        output = await File.ReadAllBytesAsync(outputPath);
        Require(Hash(output) == testCase.OutputSha256, $"Output SHA disagreement for {testCase.FileName}.");
        Require(testCase.OutputSha256 != testCase.SourceSha256, $"Node output reused source bytes for {testCase.FileName}.");
        Require(Hash(await File.ReadAllBytesAsync(inputPath)) == testCase.SourceSha256, $"Source file changed after Node mutation: {testCase.FileName}.");
        ValidateOpenXml(output, validator, $"Node output {testCase.FileName}");
        checks++;
    }
    DocumentInspectionResult? sourceInspection = null;
    try
    {
        sourceInspection = await processor.InspectAsync(new MemoryStream(source, writable: false), CancellationToken.None);
    }
    catch (DocumentProcessorException)
    {
        // A canonical safety rejection is an independent non-mutable outcome.
    }
    var dotnetSafe = sourceInspection?.SafeToMutate == true;
    if (dotnetSafe != testCase.Accepted)
    {
        crossOracleDisagreements.Add($"{testCase.FileName}: Node={testCase.Accepted}, .NET={dotnetSafe}");
        Console.Error.WriteLine($"CROSS_ORACLE_MISMATCH {crossOracleDisagreements[^1]}");
        continue;
    }
    checks++;

    if (!testCase.Accepted)
    {
        Require(testCase.OutputFile is null, $"Node unexpectedly produced an output for rejected fixture {testCase.FileName}.");
        continue;
    }

    if (sourceInspection is null) throw new InvalidDataException($"Missing .NET source inspection for {testCase.FileName}.");
    Require(sourceInspection.SourceSha256 == testCase.SourceSha256, $"Source digest disagreement for {testCase.FileName}.");
    var nodeParagraphs = testCase.Paragraphs ?? throw new InvalidDataException($"Node paragraph list missing for {testCase.FileName}.");
    Require(sourceInspection.Paragraphs.Count == nodeParagraphs.Count, $"Paragraph count disagreement for {testCase.FileName}: Node={nodeParagraphs.Count}, .NET={sourceInspection.Paragraphs.Count}.");
    for (var index = 0; index < nodeParagraphs.Count; index++)
    {
        var nodeParagraph = nodeParagraphs[index];
        var dotnetParagraph = sourceInspection.Paragraphs[index];
        Require(nodeParagraph.ParagraphId == dotnetParagraph.ParagraphId, $"Paragraph identity disagreement for {testCase.FileName} at {index}.");
        Require(CanonicalAlignment(nodeParagraph.DirectAlignment) == CanonicalAlignment(dotnetParagraph.DirectAlignment), $"Direct alignment disagreement for {testCase.FileName}/{nodeParagraph.ParagraphId}.");
    }
    using (var sourceDocument = WordprocessingDocument.Open(new MemoryStream(source, writable: false), false))
    {
        var sourceErrors = validator.Validate(sourceDocument).Take(1).ToArray();
        Require(sourceErrors.Length == 0, $"Open XML SDK source validation failed for {testCase.FileName}: {sourceErrors.FirstOrDefault()?.Description}");
    }
    checks++;

    if (testCase.OutputFile is null) continue;
    Require(output is not null && outputPath is not null, $"Node output missing for {testCase.FileName}.");
    Require(Hash(source) == testCase.SourceSha256, $"In-memory source changed after Node mutation: {testCase.FileName}.");

    var outputInspection = await processor.InspectAsync(new MemoryStream(output!, writable: false), CancellationToken.None);
    Require(outputInspection.SafeToMutate && outputInspection.SourceSha256 == testCase.OutputSha256, $".NET processor did not accept/revalidate Node output {testCase.FileName}.");
    var target = outputInspection.Paragraphs.SingleOrDefault(paragraph => paragraph.ParagraphId == testCase.TargetParagraphId);
    var sourceTarget = sourceInspection.Paragraphs.SingleOrDefault(paragraph => paragraph.ParagraphId == testCase.TargetParagraphId);
    Require(sourceTarget is not null && CanonicalAlignment(sourceTarget.DirectAlignment) == testCase.ExpectedBefore, $".NET source target precondition disagreed for {testCase.FileName}.");
    Require(target is not null && CanonicalAlignment(target.DirectAlignment) == testCase.DesiredAfter, $".NET direct alignment assertion failed for {testCase.FileName}.");

    VerifyNonTargetParts(source, output!, testCase.MainDocumentPart ?? throw new InvalidDataException("Main part missing for a Node-accepted DOCX."));
    checks++;
}

Console.WriteLine($"CROSS_ORACLE_SUMMARY cases={cases.Count} checks={checks} mutations={cases.Count(c => c.OutputFile is not null)} independentReader=OpenXmlSdk/.NET10 mismatches={crossOracleDisagreements.Count}");
if (crossOracleDisagreements.Count > 0)
    throw new InvalidDataException("Node/.NET authority disagreement: " + string.Join("; ", crossOracleDisagreements));
Console.WriteLine("CROSS_ORACLE_PASS");

static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
static string? CanonicalAlignment(string? value) => string.Equals(value, "BOTH", StringComparison.OrdinalIgnoreCase) ? "JUSTIFY" : value?.ToUpperInvariant();
static void Require(bool condition, string message) { if (!condition) throw new InvalidDataException(message); }

static void ValidateOpenXml(byte[] bytes, OpenXmlValidator validator, string label)
{
    using var document = WordprocessingDocument.Open(new MemoryStream(bytes, writable: false), false);
    var error = validator.Validate(document).Take(1).FirstOrDefault();
    Require(error is null, $"Open XML SDK validation failed for {label}: {error?.Description}");
}

static void VerifyNonTargetParts(byte[] beforeBytes, byte[] afterBytes, string mainPart)
{
    using var before = new ZipArchive(new MemoryStream(beforeBytes, writable: false), ZipArchiveMode.Read);
    using var after = new ZipArchive(new MemoryStream(afterBytes, writable: false), ZipArchiveMode.Read);
    var beforeEntries = before.Entries.ToDictionary(entry => entry.FullName, StringComparer.Ordinal);
    var afterEntries = after.Entries.ToDictionary(entry => entry.FullName, StringComparer.Ordinal);
    Require(beforeEntries.Keys.Order(StringComparer.Ordinal).SequenceEqual(afterEntries.Keys.Order(StringComparer.Ordinal)), "DOCX entry names changed across Node mutation.");
    foreach (var name in beforeEntries.Keys)
    {
        if (string.Equals(name, mainPart, StringComparison.Ordinal)) continue;
        using var left = beforeEntries[name].Open();
        using var right = afterEntries[name].Open();
        Require(Hash(ReadAll(left)) == Hash(ReadAll(right)), $"Non-target package part changed: {name}");
    }
}

static byte[] ReadAll(Stream stream) { using var memory = new MemoryStream(); stream.CopyTo(memory); return memory.ToArray(); }

sealed record NodeCase(string FileName, bool Accepted, string SourceSha256, string? MainDocumentPart, List<NodeParagraph>? Paragraphs, string? OutputFile, string? OutputSha256, string? TargetParagraphId, string? ExpectedBefore, string? DesiredAfter);
sealed record NodeParagraph(string ParagraphId, string Text, string? DirectAlignment, string Anchor);
