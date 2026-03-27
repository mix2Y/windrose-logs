FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY ["src/WindroseLogs.API/WindroseLogs.API.csproj", "src/WindroseLogs.API/"]
COPY ["src/WindroseLogs.Core/WindroseLogs.Core.csproj", "src/WindroseLogs.Core/"]
COPY ["src/WindroseLogs.Infrastructure/WindroseLogs.Infrastructure.csproj", "src/WindroseLogs.Infrastructure/"]

# Override target framework for Docker build (sdk:9.0 can't build net10.0)
RUN find /src -name "*.csproj" -exec sed -i 's/net10.0/net9.0/g' {} \;
RUN dotnet restore "src/WindroseLogs.API/WindroseLogs.API.csproj"

COPY . .
WORKDIR "/src/src/WindroseLogs.API"
RUN dotnet build -c Release -o /app/build

FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
RUN mkdir -p storage/logs
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "WindroseLogs.API.dll"]
