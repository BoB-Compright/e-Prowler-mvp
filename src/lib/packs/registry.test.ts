import { describe, expect, it } from "vitest";
import { findVendorPack, ALL_PACKS } from "./registry";

describe("registry", () => {
  it("finds the nginx pack by WEB/Nginx (case-insensitive vendor)", () => {
    expect(findVendorPack("WEB", "Nginx")?.id).toBe("web-nginx");
    expect(findVendorPack("WEB", "nginx")?.id).toBe("web-nginx");
  });
  it("returns undefined for an unregistered vendor", () => {
    expect(findVendorPack("DB", "SQLServer")).toBeUndefined();
  });
  it("registers only baseline + web-nginx in this cycle", () => {
    expect(ALL_PACKS.map((p) => p.id).sort()).toEqual(["container", "db-mysql", "db-oracle", "db-postgresql", "os-unix", "was-tomcat", "web-apache", "web-nginx"]);
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
});
