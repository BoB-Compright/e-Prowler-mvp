import { describe, expect, it } from "vitest";
import { findVendorPack, ALL_PACKS, getVendorInputSpecs } from "./registry";

describe("registry", () => {
  it("finds the nginx pack by WEB/Nginx (case-insensitive vendor)", () => {
    expect(findVendorPack("WEB", "Nginx")?.id).toBe("web-nginx");
    expect(findVendorPack("WEB", "nginx")?.id).toBe("web-nginx");
  });
  it("returns undefined for an unregistered vendor", () => {
    expect(findVendorPack("DB", "SQLServer")).toBeUndefined();
  });
  it("registers only baseline + web-nginx in this cycle", () => {
    expect(ALL_PACKS.map((p) => p.id).sort()).toEqual(["container", "db-mssql", "db-mysql", "db-oracle", "db-postgresql", "jeus", "os-unix", "os-windows", "tibero", "was-tomcat", "was-websphere", "was-weblogic", "web-apache", "web-iis", "web-nginx", "webtob"].sort());
  });
  it("finds the apache pack by WEB/Apache (case-insensitive vendor)", () => {
    expect(findVendorPack("WEB", "Apache")?.id).toBe("web-apache");
    expect(findVendorPack("WEB", "apache")?.id).toBe("web-apache");
  });
  it("finds the tomcat pack by WAS/Tomcat (case-insensitive vendor)", () => {
    expect(findVendorPack("WAS", "Tomcat")?.id).toBe("was-tomcat");
    expect(findVendorPack("WAS", "tomcat")?.id).toBe("was-tomcat");
  });
  it("finds the db-mysql pack by DB/MySQL and DB/MariaDB (case-insensitive vendor)", () => {
    expect(findVendorPack("DB", "MySQL")?.id).toBe("db-mysql");
    expect(findVendorPack("DB", "mysql")?.id).toBe("db-mysql");
    expect(findVendorPack("DB", "MariaDB")?.id).toBe("db-mysql");
    expect(findVendorPack("DB", "mariadb")?.id).toBe("db-mysql");
  });
  it("finds the db-postgresql pack by DB/PostgreSQL (case-insensitive vendor)", () => {
    expect(findVendorPack("DB", "PostgreSQL")?.id).toBe("db-postgresql");
    expect(findVendorPack("DB", "postgresql")?.id).toBe("db-postgresql");
  });
  it("finds the db-oracle pack by DB/Oracle (case-insensitive vendor)", () => {
    expect(findVendorPack("DB", "Oracle")?.id).toBe("db-oracle");
    expect(findVendorPack("DB", "oracle")?.id).toBe("db-oracle");
  });
  it("finds the os-windows pack by OS/Windows Server", () => {
    expect(findVendorPack("OS", "Windows Server")?.id).toBe("os-windows");
  });
  it("finds the windows app packs by category/vendor (case-insensitive)", () => {
    expect(findVendorPack("WEB", "IIS")?.id).toBe("web-iis");
    expect(findVendorPack("DB", "MSSQL")?.id).toBe("db-mssql");
    expect(findVendorPack("WAS", "WebLogic")?.id).toBe("was-weblogic");
    expect(findVendorPack("WAS", "WebSphere")?.id).toBe("was-websphere");
  });
  it("finds the jeus pack by WAS/JEUS (case-insensitive vendor)", () => {
    expect(findVendorPack("WAS", "JEUS")?.id).toBe("jeus");
    expect(findVendorPack("WAS", "jeus")?.id).toBe("jeus");
  });
  it("finds the webtob pack by WEB/WebtoB (case-insensitive vendor)", () => {
    expect(findVendorPack("WEB", "WebtoB")?.id).toBe("webtob");
    expect(findVendorPack("WEB", "webtob")?.id).toBe("webtob");
  });
});

describe("getVendorInputSpecs", () => {
  it("returns [] for a vendor without a pack or without requiredInputs", () => {
    expect(getVendorInputSpecs("DB", "존재하지않는벤더")).toEqual([]);
  });
  it("returns 2 input specs (jeus_home, jeus_domain) for WAS/JEUS", () => {
    const specs = getVendorInputSpecs("WAS", "JEUS");
    expect(specs.map((s) => s.name)).toEqual(["jeus_home", "jeus_domain"]);
  });
});
