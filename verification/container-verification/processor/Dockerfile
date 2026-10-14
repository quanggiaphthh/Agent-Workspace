FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY v22-runtime/src/ ./v22-runtime/src/
RUN dotnet publish v22-runtime/src/DocumentProcessor.Host/DocumentProcessor.Host.csproj \
    -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    TMPDIR=/tmp
COPY --from=build /app/publish ./
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "DocumentProcessor.Host.dll"]
